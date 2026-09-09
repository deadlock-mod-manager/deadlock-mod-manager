import { z } from "zod";

export const ForceSyncOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
