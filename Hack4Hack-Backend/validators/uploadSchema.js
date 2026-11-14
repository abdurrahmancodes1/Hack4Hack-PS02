import { z } from "zod";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MIN_FILE_SIZE_BYTES = 22; // Minimum size of an empty ZIP end-of-directory record

export const initiateUploadSchema = z.object({
  fileName: z
    .string()
    .min(1, "File name is required")
    .max(255, "File name is too long")
    .trim()
    .refine(
      (name) => /\.zip$/i.test(name),
      "Only ZIP archives are currently supported",
    ),
  fileSizeBytes: z
    .number()
    .int("File size must be an integer")
    .min(
      MIN_FILE_SIZE_BYTES,
      `A ZIP upload must be at least ${MIN_FILE_SIZE_BYTES} bytes`,
    )
    .max(
      MAX_FILE_SIZE_BYTES,
      `File size exceeds maximum limit of 100 MB (${MAX_FILE_SIZE_BYTES} bytes)`,
    ),
  partCount: z
    .number()
    .int("Part count must be an integer")
    .min(1, "Part count must be at least 1")
    .max(20, "Part count cannot exceed 20 parts"),
  contentType: z.string().max(128).optional().default("application/zip"),
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
