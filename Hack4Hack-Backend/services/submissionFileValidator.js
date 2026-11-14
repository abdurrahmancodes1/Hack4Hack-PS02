import { fileTypeFromBuffer } from "file-type";
import { inspectArchiveStream } from "./archiveValidator.js";
import { inspectPdfStream } from "./pdfValidator.js";

export const inspectSubmissionFileStream = async (headerBuffer, bodyStream) => {
  const detectedMimeType = (await fileTypeFromBuffer(headerBuffer))?.mime;
  if (detectedMimeType === "application/pdf") {
    return inspectPdfStream(bodyStream);
  }

  const result = await inspectArchiveStream(headerBuffer, bodyStream);
  if (!result.valid && result.errors.includes("Only ZIP archives are supported")) {
    return { ...result, errors: ["File content is not a valid ZIP archive or PDF"] };
  }
  return result;
};
