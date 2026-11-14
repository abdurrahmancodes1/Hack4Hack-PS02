import { z } from "zod";

export const createTeamSchema = z.object({
  name: z
    .string()
    .min(2, "Team name must be at least 2 characters")
    .max(100, "Team name cannot exceed 100 characters")
    .trim(),
});

export const joinTeamSchema = z.object({
  teamCode: z
    .string()
    .min(4, "Team code is required")
    .max(20, "Team code is too long")
    .trim()
    .toUpperCase(),
});
