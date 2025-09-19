import { z } from "zod";
import { ModCategory } from "@/lib/constants";

/**
 * Form schema and types for adding mods
 */
export const addModSchema = z.object({
  category: z.nativeEnum(ModCategory),
  sourceType: z.enum(["archive", "vpk"]),
});

export type AddModFormValues = z.infer<typeof addModSchema>;

/**
 * Input element attributes for file upload
 */
export interface FileInputAttributes {
  accept: string;
  className: string;
  multiple: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  ref: React.RefObject<HTMLInputElement>;
  type: "file";
  // Non-standard attributes for directory support
  webkitdirectory?: string;
  directory?: string;
}
