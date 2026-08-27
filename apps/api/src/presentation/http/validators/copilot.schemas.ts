import { z } from "zod";

export const askCopilotSchema = z.object({
  question: z.string().trim().min(1).max(1000),
});
