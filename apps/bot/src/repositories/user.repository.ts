import {
  account,
  and,
  db,
  eq,
  ilike,
  inArray,
  user,
} from "@deadlock-mods/database";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({ repository: "UserRepository" });

export async function findUserIdsByDiscordIds(
  discordIds: string[],
): Promise<string[]> {
  if (discordIds.length === 0) return [];

  try {
    const rows = await db
      .select({ userId: account.userId })
      .from(account)
      .where(
        and(
          eq(account.providerId, "discord"),
          inArray(account.accountId, discordIds),
        ),
      );

    return rows.map((row) => row.userId);
  } catch (error) {
    logger.withError(error).error("Failed to find user IDs by Discord IDs");
    return [];
  }
}

export async function findUserIdByDiscordId(
  discordId: string,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ userId: account.userId })
      .from(account)
      .where(
        and(
          eq(account.providerId, "discord"),
          eq(account.accountId, discordId),
        ),
      )
      .limit(1);

    return row?.userId ?? null;
  } catch (error) {
    logger
      .withError(error)
      .withMetadata({ discordId })
      .error("Failed to find user ID by Discord ID");
    return null;
  }
}

export async function findUserIdByName(name: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(ilike(user.name, name))
      .limit(1);

    return row?.id ?? null;
  } catch (error) {
    logger
      .withError(error)
      .withMetadata({ name })
      .error("Failed to find user ID by name");
    return null;
  }
}
