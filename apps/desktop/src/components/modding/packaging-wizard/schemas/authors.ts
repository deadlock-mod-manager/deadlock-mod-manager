import { z } from "zod";

export const authorSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  url: z.string().min(1),
});
export const authorsSchema = z.object({
  authors: z.array(authorSchema).min(1),
});
