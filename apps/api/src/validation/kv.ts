import { z } from "zod";

export const ParseKvInputSchema = z.object({
  content: z.string(),
});
