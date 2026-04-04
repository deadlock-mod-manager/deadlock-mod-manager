import { PermissionFlagsBits, type GuildMember, type User } from "discord.js";
import { discordConfig } from "@/discord/config";
import { wideEventContext } from "@/lib/logger";

export function hasReportModerationPermission(
  user: User,
  member: GuildMember | null,
): boolean {
  const wide = wideEventContext.get();

  if (!member) {
    wide?.merge({
      permissionCheck: {
        kind: "report_moderation",
        allowed: false,
        reason: "not_guild_member",
        userId: user.id,
      },
    });
    return false;
  }

  const userRoles = member.roles.cache.map((role) => role.id);
  const hasRequiredRole = discordConfig.reportModeratorRoles.some((roleId) =>
    userRoles.includes(roleId),
  );

  wide?.merge({
    permissionCheck: {
      kind: "report_moderation",
      allowed: hasRequiredRole,
      userId: user.id,
      userRoles,
      requiredRoles: discordConfig.reportModeratorRoles,
    },
  });

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
  const wide = wideEventContext.get();

  if (user.id === discordConfig.ownerId) {
    wide?.merge({
      permissionCheck: {
        kind: "blacklist",
        allowed: true,
        reason: "owner",
        userId: user.id,
      },
    });
    return true;
  }

  if (!member) {
    wide?.merge({
      permissionCheck: {
        kind: "blacklist",
        allowed: false,
        reason: "not_guild_member",
        userId: user.id,
      },
    });
    return false;
  }

  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const userRoles = member.roles.cache.map((role) => role.id);
  const hasBlacklistRole = discordConfig.blacklistModeratorRoles.some(
    (roleId) => userRoles.includes(roleId),
  );

  const hasPermission = isAdmin || hasBlacklistRole;

  wide?.merge({
    permissionCheck: {
      kind: "blacklist",
      allowed: hasPermission,
      userId: user.id,
      isAdmin,
      userRoles,
      blacklistModeratorRoles: discordConfig.blacklistModeratorRoles,
      hasBlacklistRole,
    },
  });

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
