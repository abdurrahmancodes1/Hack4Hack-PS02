import { fileTypeFromBuffer } from "file-type";
import unzipper from "unzipper";
import crypto from "node:crypto";
import { PassThrough, Readable } from "node:stream";

export const MAX_UNCOMPRESSED_BYTES = 300 * 1024 * 1024;
export const MAX_FILE_ENTRIES = 5000;
export const MAX_ENTRY_SIZE_BYTES = 300 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 8 * 1024;

const FORBIDDEN_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".vbs",
  ".ps1",
  ".msi",
  ".scr",
  ".pif",
];
const README_NAMES = new Set([
  "readme",
  "readme.md",
  "readme.txt",
  "readme.rst",
]);

const readReadmePreview = (entryPath, chunks, total) => {
  const name = entryPath.split("/").pop().toLowerCase();
  if (!README_NAMES.has(name)) return null;
  const buf = Buffer.concat(chunks).subarray(0, MAX_PREVIEW_BYTES);
  return {
    kind: "zip_readme",
    text: buf.toString("utf8"),
    truncated: total > MAX_PREVIEW_BYTES,
  };
};

export const inspectArchiveStream = async (headerBuffer, bodyStream) => {
  const errors = [];
  const hash = crypto.createHash("sha256");

  // Hash raw compressed bytes as they flow through the same stream the parser
  // reads. If the source errors mid-stream, we throw (below) instead of
  // returning a partial hash.
  const hashed = new PassThrough();
  bodyStream.on("error", (e) => hashed.destroy(e));
  bodyStream.on("data", (chunk) => hash.update(chunk));
  bodyStream.pipe(hashed);

  let fileCount = 0;
  let totalUncompressedBytes = 0;
  let preview = null;

  // ── BUG 1 FIX ─────────────────────────────────────────────────────────────
  const typeResult = await fileTypeFromBuffer(headerBuffer);
  const detectedMimeType = typeResult?.mime || "unknown";

  if (detectedMimeType !== "application/zip") {
    try {
      for await (const _ of hashed) {
      }
    } catch {}
    return {
      valid: false,
      errors: ["Only ZIP archives are supported"],
      fileCount: 0,
      uncompressedSizeBytes: 0,
      detectedMimeType,
      contentHashSha256: hash.digest("hex"),
      preview: null,
    };
  }

  const parser = hashed.pipe(unzipper.Parse({ forceStream: true }));
  let sourceError = null;
  bodyStream.on("error", (e) => {
    sourceError = e;
    parser.destroy(e);
  });

  try {
    for await (const entry of parser) {
      fileCount++;
      if (fileCount > MAX_FILE_ENTRIES) {
        throw new Error("ZIP contains too many entries");
      }

      // ── BUG 3 FIX: capital L ─────────────────────────────────────────────
      if (entry.type === "SymbolicLink") {
        throw new Error(`Unsafe ZIP entry (symlink): ${entry.path}`);
      }

      const normalizedPath = entry.path.replace(/\\/g, "/");
      const segments = normalizedPath.split("/");

      if (
        normalizedPath.startsWith("/") ||
        /^[a-zA-Z]:/.test(normalizedPath) ||
        segments.includes("..") ||
        normalizedPath.includes("\0")
      ) {
        throw new Error(`Unsafe ZIP entry path: ${entry.path}`);
      }

      const lowerName = normalizedPath.toLowerCase();
      if (FORBIDDEN_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
        throw new Error(`Forbidden file type: ${entry.path}`);
      }

      let entryBytes = 0;
      let entryCapturedBytes = 0;
      const entryChunks = [];

      for await (const chunk of entry) {
        entryBytes += chunk.length;
        totalUncompressedBytes += chunk.length;

        if (entryBytes > MAX_ENTRY_SIZE_BYTES) {
          throw new Error(`Entry exceeds maximum size: ${entry.path}`);
        }
        if (totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
          throw new Error("ZIP exceeds maximum total decompressed size");
        }

        // ── BUG 4 FIX: byte-based capture ──────────────────────────────────
        if (!preview && entryCapturedBytes < MAX_PREVIEW_BYTES) {
          const room = MAX_PREVIEW_BYTES - entryCapturedBytes;
          const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
          entryChunks.push(slice);
          entryCapturedBytes += slice.length;
        }
      }

      const compressedBytes = Number(entry.vars?.compressedSize || 0);
      if (compressedBytes > 0 && entryBytes / compressedBytes > 100) {
        throw new Error(`Entry compression ratio is too high: ${entry.path}`);
      }

      if (!preview) {
        const candidate = readReadmePreview(
          normalizedPath,
          entryChunks,
          entryBytes,
        );
        if (candidate) preview = candidate;
      }
    }

    // ── BUG 2 FIX: include hash + preview + real mime type ────────────────
    return {
      valid: true,
      errors,
      fileCount,
      uncompressedSizeBytes: totalUncompressedBytes,
      detectedMimeType,
      contentHashSha256: hash.digest("hex"),
      preview,
    };
  } catch (error) {
    try {
      parser.destroy();
    } catch {}
    try {
      bodyStream.destroy();
    } catch {}

    // Infrastructure failure → retry, do NOT return a partial hash.
    if (sourceError) throw sourceError;

    return {
      valid: false,
      errors: [error.message],
      fileCount,
      uncompressedSizeBytes: totalUncompressedBytes,
      detectedMimeType,
      contentHashSha256: hash.digest("hex"),
      preview,
    };
  }
};
