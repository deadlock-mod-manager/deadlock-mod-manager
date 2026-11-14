import { z } from "zod";
import { ModCategory } from "@/lib/constants";

// What the `map` console command takes: no spaces or path separators.
const MAP_NAME_PATTERN = /^[\w-]*$/;

/**
 * Form schema and types for adding mods
 */
export const addModSchema = z.object({
  category: z.nativeEnum(ModCategory),
  mapName: z.string().trim().regex(MAP_NAME_PATTERN).optional(),
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
