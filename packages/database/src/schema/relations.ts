import { relations } from "drizzle-orm";
import { friendships, user } from "./auth";
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

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  owner: one(user, {
    fields: [friendships.userId],
    references: [user.id],
  }),
  friend: one(user, {
    fields: [friendships.friendId],
    references: [user.id],
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  featureFlagOverrides: many(userFeatureFlagOverrides),
  friendships: many(friendships, {
    relationName: "owner",
  }),
  inverseFriendships: many(friendships, {
    relationName: "friend",
  }),
}));
