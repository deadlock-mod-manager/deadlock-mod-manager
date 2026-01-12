import { relations } from "drizzle-orm";
import { friendships, user, userHeartbeats } from "./auth";
import { crosshairLikes, crosshairs } from "./crosshairs";
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
    relationName: "owner",
  }),
  friend: one(user, {
    fields: [friendships.friendId],
    references: [user.id],
    relationName: "friend",
  }),
}));

export const userHeartbeatsRelations = relations(userHeartbeats, ({ one }) => ({
  user: one(user, {
    fields: [userHeartbeats.userId],
    references: [user.id],
  }),
}));

export const userRelations = relations(user, ({ many, one }) => ({
  featureFlagOverrides: many(userFeatureFlagOverrides),
  crosshairs: many(crosshairs),
  crosshairLikes: many(crosshairLikes),
  friendships: many(friendships, { relationName: "owner" }),
  inverseFriendships: many(friendships, { relationName: "friend" }),
  heartbeat: one(userHeartbeats),
}));

export const crosshairsRelations = relations(crosshairs, ({ one, many }) => ({
  user: one(user, {
    fields: [crosshairs.userId],
    references: [user.id],
  }),
  likes: many(crosshairLikes),
}));

export const crosshairLikesRelations = relations(crosshairLikes, ({ one }) => ({
  crosshair: one(crosshairs, {
    fields: [crosshairLikes.crosshairId],
    references: [crosshairs.id],
  }),
  user: one(user, {
    fields: [crosshairLikes.userId],
    references: [user.id],
  }),
}));
