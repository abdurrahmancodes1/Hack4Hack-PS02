import { z } from "zod/v4";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  role: z.enum(["Participant", "Organizer"]).optional(),
});

export const registerSchema = loginSchema.extend({
  name: z.string().min(2).max(100),
  role: z.enum(["Participant", "Organizer"]).optional(),
});
