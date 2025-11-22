import { z } from "zod";
import { DeadlockHeroes } from "../constants";

export const crosshairConfigSchema = z.object({
  gap: z.number().min(-20).max(50).multipleOf(1),
  width: z.number().min(0).max(100).multipleOf(0.1),
  height: z.number().min(0).max(100).multipleOf(0.1),
  pipOpacity: z.number().min(0).max(1).multipleOf(0.1),
  dotOpacity: z.number().min(0).max(1).multipleOf(0.1),
  dotOutlineOpacity: z.number().min(0).max(1).multipleOf(0.1),
  color: z.object({
    r: z.number().min(0).max(255),
    g: z.number().min(0).max(255),
    b: z.number().min(0).max(255),
  }),
  pipBorder: z.boolean(),
  pipGapStatic: z.boolean(),
  hero: z.union([z.literal("Default"), z.enum(Object.values(DeadlockHeroes))]),
});

export const CreateCrosshairSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(500).optional(),
  config: crosshairConfigSchema,
  tags: z.array(z.string()).min(0).max(10),
  heroes: z
    .array(
      z.union([
        z.literal("Default"),
        z.enum(Object.values(DeadlockHeroes) as [string, ...string[]]),
      ]),
    )
    .min(1)
    .max(5),
});

export const CrosshairIdParamSchema = z.object({
  id: z.string(),
});

export const CrosshairDtoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string().nullable(),
  userImage: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  config: crosshairConfigSchema,
  tags: z.array(z.string()),
  heroes: z.array(z.string()),
  likes: z.number().int(),
  downloads: z.number().int(),
  hasLiked: z.boolean().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CrosshairsListResponseSchema = z.array(CrosshairDtoSchema);

export const CrosshairLikesResponseSchema = z.object({
  likes: z.number().int(),
  hasLiked: z.boolean(),
});
