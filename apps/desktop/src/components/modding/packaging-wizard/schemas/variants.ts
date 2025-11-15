import { z } from "zod";

export const variantSchema = z.object({
  id: z.string().min(1, "Variant ID is required"),
  name: z.string().min(1, "Variant name is required"),
  description: z.string().optional(),
  layers: z.array(z.string()).min(1, "At least one layer must be selected"),
  preview_image: z.string().optional(),
  screenshots: z.array(z.string()).optional(),
});

export const variantGroupSchema = z.object({
  id: z.string().min(1, "Variant group ID is required"),
  name: z.string().min(1, "Variant group name is required"),
  description: z.string().optional(),
  default: z.string().min(1, "Default variant must be specified"),
  variants: z.array(variantSchema).min(1, "At least one variant is required"),
});

export const variantGroupsSchema = z.object({
  variant_groups: z.array(variantGroupSchema).optional(),
});
