import type { GuildMember, User } from "discord.js";
import { env } from "./env";
import { logger as mainLogger } from "./logger";

const logger = mainLogger.child().withContext({
  service: "permissions",
});

/**
 * Check if a user has any of the required moderator roles for report verification
 */
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
  const hasRequiredRole = env.REPORT_MODERATOR_ROLES.some((roleId) =>
    userRoles.includes(roleId),
  );

  logger
    .withMetadata({
      userId: user.id,
      username: user.username,
      userRoles,
      requiredRoles: env.REPORT_MODERATOR_ROLES,
      hasPermission: hasRequiredRole,
    })
    .debug("Checked report moderation permission");

  return hasRequiredRole;
}

/**
 * Get a formatted list of required roles for error messages
 */
export function getRequiredRolesDisplay(): string {
  return env.REPORT_MODERATOR_ROLES.map((roleId) => `<@&${roleId}>`).join(", ");
}
