import { env } from "@/lib/env";

export const discordConfig = {
  ownerId: env.DISCORD_OWNER_ID,
  reportModeratorRoles: env.REPORT_MODERATOR_ROLES,
  blacklistModeratorRoles: env.BLACKLIST_MODERATOR_ROLES,
  coreMaintainerRoles: env.CORE_CONTRIBUTOR_ROLES,
  kbChannelId: "1481144600016978044",
  bugReportChannelId: "1418618964925480990",
  escalationConfidenceThreshold: 0.3,
} as const;
