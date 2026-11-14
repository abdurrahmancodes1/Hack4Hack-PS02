import { z } from "zod";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MIN_FILE_SIZE_BYTES = 1;

const ALLOWED_FILE_EXTENSIONS = /\.(zip|pdf)$/i;
export const initiateUploadSchema = z.object({
  fileName: z
    .string()
    .min(1, "File name is required")
    .max(255, "File name is too long")
    .trim()
    .refine(
      (name) => ALLOWED_FILE_EXTENSIONS.test(name),
      "Only ZIP and PDF files are supported",
    ),

  fileSizeBytes: z
    .number()
    .int()
    .min(MIN_FILE_SIZE_BYTES)
    .max(MAX_FILE_SIZE_BYTES),

  partCount: z.number().int().min(1).max(20),

  contentType: z
    .string()
    .max(128)
    .optional()
    .default("application/octet-stream"),
});

export const signPartSchema = z.object({
  fileId: z.string().min(1, "fileId is required").max(24),
  partNumber: z
    .number()
    .int("Part number must be an integer")
    .min(1, "Part number must be at least 1")
    .max(100, "Part number cannot exceed 100"),
});

export const completeUploadSchema = z.object({
  fileId: z.string().min(1, "fileId is required").max(24),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1),
        etag: z.string().min(1, "ETag is required").max(512).trim(),
      }),
    )
    .min(1, "At least one part is required to complete upload")
    .max(20, "No more than 20 parts are supported"),
});
