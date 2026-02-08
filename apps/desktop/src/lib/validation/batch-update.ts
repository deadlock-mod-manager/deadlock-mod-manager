import { z } from "zod";
import { profileModFileTreeSchema } from "@deadlock-mods/shared";

const InstalledModInfoSchema = z.object({
  modId: z.string(),
  modName: z.string(),
  installedVpks: z.array(z.string()),
  fileTree: profileModFileTreeSchema.optional(),
});

export const BatchUpdateResultSchema = z.object({
  backupName: z.string(),
  succeeded: z.array(z.string()),
  failed: z.array(z.tuple([z.string(), z.string()])),
  installedMods: z.array(InstalledModInfoSchema),
});
