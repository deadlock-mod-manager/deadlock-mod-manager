import { z } from "zod";

export const UserIdResponseSchema = z.object({
  userId: z.string(),
});
