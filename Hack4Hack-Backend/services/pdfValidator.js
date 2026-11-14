import crypto from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 8 * 1024;
const NO_TEXT_PREVIEW = "No selectable text on the first page; this PDF may be scanned.";

export const inspectPdfStream = async (bodyStream) => {
  const hash = crypto.createHash("sha256");
  const chunks = [];
  let totalBytes = 0;
  let tooLarge = false;

  // Buffer at most the configured upload limit. The worker has already checked
  // S3's ContentLength, but enforce the same bound while reading the stream.
  for await (const chunk of bodyStream) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += bytes.length;
    hash.update(bytes);
    if (totalBytes > MAX_PDF_BYTES) {
      tooLarge = true;
      continue;
    }
    chunks.push(bytes);
  }

  const contentHashSha256 = hash.digest("hex");
  if (tooLarge) {
    return {
      valid: false,
      errors: ["PDF exceeds the 100 MB upload limit"],
      fileCount: 0,
      uncompressedSizeBytes: 0,
      detectedMimeType: "application/pdf",
      contentHashSha256,
      preview: null,
    };
  }

  const data = Buffer.concat(chunks, totalBytes);
  if (!data.length) {
    return {
      valid: false,
      errors: ["PDF is empty"],
      fileCount: 0,
      uncompressedSizeBytes: 0,
      detectedMimeType: "application/pdf",
      contentHashSha256,
      preview: null,
    };
  }

  let loadingTask;
  let pdf;
  try {
    // PDF.js parses the document structure and extracts only page one's text.
    // Disable document scripting and XFA processing for uploaded submissions.
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    loadingTask = getDocument({
      data: bytes,
      isEvalSupported: false,
      enableXfa: false,
      stopAtErrors: true,
      useSystemFonts: false,
    });
    pdf = await loadingTask.promise;
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) {
      throw new Error("PDF has no pages");
    }

    const page = await pdf.getPage(1);
    const { items = [] } = await page.getTextContent();
    const firstPageText = items
      .filter((item) => typeof item.str === "string" && item.str.length)
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const previewText = firstPageText
      ? firstPageText.slice(0, MAX_PREVIEW_BYTES)
      : NO_TEXT_PREVIEW;

    page.cleanup();
    return {
      valid: true,
      errors: [],
      fileCount: 0,
      uncompressedSizeBytes: 0,
      detectedMimeType: "application/pdf",
      contentHashSha256,
      preview: {
        kind: "pdf_first_page",
        text: previewText,
        truncated: firstPageText.length > MAX_PREVIEW_BYTES,
      },
      pageCount: pdf.numPages,
    };
  } catch {
    return {
      valid: false,
      errors: ["PDF is corrupt, encrypted, or could not be parsed"],
      fileCount: 0,
      uncompressedSizeBytes: 0,
      detectedMimeType: "application/pdf",
      contentHashSha256,
      preview: null,
    };
  } finally {
    if (pdf) await pdf.destroy().catch(() => {});
    else if (loadingTask) await loadingTask.destroy().catch(() => {});
  }
};
