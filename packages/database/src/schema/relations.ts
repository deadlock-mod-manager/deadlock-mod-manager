import { relations } from "drizzle-orm";
import { user } from "./auth";
import { featureFlags, userFeatureFlagOverrides } from "./feature-flags";
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

export const userFeatureFlagOverridesRelations = relations(
  userFeatureFlagOverrides,
  ({ one }) => ({
    user: one(user, {
      fields: [userFeatureFlagOverrides.userId],
      references: [user.id],
    }),
    featureFlag: one(featureFlags, {
      fields: [userFeatureFlagOverrides.featureFlagId],
      references: [featureFlags.id],
    }),
  }),
);

export const featureFlagsRelations = relations(featureFlags, ({ many }) => ({
  userOverrides: many(userFeatureFlagOverrides),
}));

export const userRelations = relations(user, ({ many }) => ({
  featureFlagOverrides: many(userFeatureFlagOverrides),
}));
