import { CustomSettingType } from "@deadlock-mods/shared";
import { z } from "zod";

export const createSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  type: z.nativeEnum(CustomSettingType),
  description: z.string().min(2).max(50),
});

export type CreateSettingSchema = z.infer<typeof createSettingSchema>;
