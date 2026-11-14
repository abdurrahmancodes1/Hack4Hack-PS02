import { z } from "zod";

const httpUrl = z.string().url().max(2048).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Only HTTP and HTTPS links are supported");

export const createSubmissionSchema = z.object({
  fileId: z.string().min(1, "fileId is required").trim(),
  title: z
    .string()
    .min(2, "Submission title must be at least 2 characters")
    .max(200, "Submission title cannot exceed 200 characters")
    .trim(),
  description: z
    .string()
    .max(2000, "Description cannot exceed 2000 characters")
    .optional()
    .default(""),
  repoUrl: httpUrl
    .optional()
    .or(z.literal("")),
  liveDemoUrl: httpUrl
    .optional()
    .or(z.literal("")),
  notes: z.string().max(1000).optional().default(""),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});
