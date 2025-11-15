import { z } from "zod";

export const vpkFileSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
});

export const layerSchema = z.object({
  name: z.string().min(1, "Layer name is required"),
  priority: z.number().min(0, "Priority must be 0 or greater"),
  description: z.string().optional(),
  required: z.boolean().default(false),
  vpkFiles: z.array(vpkFileSchema).optional(),
});

export const layersSchema = z.object({
  layers: z.array(layerSchema).min(1, "At least one layer is required"),
});
