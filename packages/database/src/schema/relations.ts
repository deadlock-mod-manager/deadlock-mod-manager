import { relations } from "drizzle-orm";
import { mirroredFiles } from "./mirrored-files";
import { modDownloads, mods } from "./mods";

export const mirroredFilesRelations = relations(mirroredFiles, ({ one }) => ({
  modDownload: one(modDownloads, {
    fields: [mirroredFiles.modDownloadId],
    references: [modDownloads.id],
  }),
  mod: one(mods, {
    fields: [mirroredFiles.modId],
    references: [mods.id],
  }),
}));

export const modDownloadsRelations = relations(
  modDownloads,
  ({ one, many }) => ({
    mod: one(mods, {
      fields: [modDownloads.modId],
      references: [mods.id],
    }),
    mirroredFiles: many(mirroredFiles),
  }),
);
