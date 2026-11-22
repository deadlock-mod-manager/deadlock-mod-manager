import { z } from "zod";
import { ModCategory } from "@/lib/constants";

const MAP_NAME_PATTERN = /^[\w-]*$/;

export const addModSchema = z.object({
  category: z.nativeEnum(ModCategory),
  mapName: z.string().trim().regex(MAP_NAME_PATTERN).optional(),
});

export type AddModFormValues = z.infer<typeof addModSchema>;

export interface FileInputAttributes {
  accept: string;
  className: string;
  multiple: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  ref: React.RefObject<HTMLInputElement>;
  type: "file";
  webkitdirectory?: string;
  directory?: string;
}
