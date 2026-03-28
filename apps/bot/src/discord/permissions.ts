import { PermissionFlagsBits, type GuildMember, type User } from "discord.js";
import { discordConfig } from "@/discord/config";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "permissions",
});

export function hasReportModerationPermission(
  user: User,
  member: GuildMember | null,
): boolean {
  if (!member) {
    logger
      .withMetadata({
        userId: user.id,
        username: user.username,
      })
      .debug(
        "User is not a guild member, denying report moderation permission",
      );
    return false;
  }

  const userRoles = member.roles.cache.map((role) => role.id);
  const hasRequiredRole = discordConfig.reportModeratorRoles.some((roleId) =>
    userRoles.includes(roleId),
  );

  logger
    .withMetadata({
      userId: user.id,
      username: user.username,
      userRoles,
      requiredRoles: discordConfig.reportModeratorRoles,
      hasPermission: hasRequiredRole,
    })
    .debug("Checked report moderation permission");

  return hasRequiredRole;
}

export function getRequiredRolesDisplay(): string {
  return discordConfig.reportModeratorRoles
    .map((roleId) => `<@&${roleId}>`)
    .join(", ");
}

export function hasBlacklistPermission(
  user: User,
  member: GuildMember | null,
): boolean {
  if (user.id === discordConfig.ownerId) {
    logger
      .withMetadata({
        userId: user.id,
        username: user.username,
      })
      .debug("User is bot owner, allowing blacklist permission");
    return true;
  }

  if (!member) {
    logger
      .withMetadata({
        userId: user.id,
        username: user.username,
      })
      .debug("User is not a guild member, denying blacklist permission");
    return false;
  }

  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const userRoles = member.roles.cache.map((role) => role.id);
  const hasBlacklistRole = discordConfig.blacklistModeratorRoles.some(
    (roleId) => userRoles.includes(roleId),
  );

  const hasPermission = isAdmin || hasBlacklistRole;

  logger
    .withMetadata({
      userId: user.id,
      username: user.username,
      isAdmin,
      userRoles,
      blacklistModeratorRoles: discordConfig.blacklistModeratorRoles,
      hasBlacklistRole,
      hasPermission,
    })
    .debug("Checked blacklist permission");

  return hasPermission;
}

export function getBlacklistRequiredPermissionsDisplay(): string {
  const ownerText = "bot owner";
  const adminText = "Server Administrator";
  const roleText =
    discordConfig.blacklistModeratorRoles.length > 0
      ? discordConfig.blacklistModeratorRoles
          .map((roleId) => `<@&${roleId}>`)
          .join(", ")
      : "";

  const parts = [ownerText, adminText];
  if (roleText) {
    parts.push(roleText);
  }
  return parts.join(", or ");
}
