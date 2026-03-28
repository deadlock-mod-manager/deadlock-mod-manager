import { env } from "@/lib/env";

export const discordConfig = {
  ownerId: env.DISCORD_OWNER_ID,
  reportModeratorRoles: env.REPORT_MODERATOR_ROLES,
  blacklistModeratorRoles: env.BLACKLIST_MODERATOR_ROLES,
  coreMaintainerRoles: env.CORE_CONTRIBUTOR_ROLES,
} as const;
