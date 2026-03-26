import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { account, user } from "../schema/auth";
import {
  type AuthorVerification,
  type NewAuthorVerification,
  authorVerification,
} from "../schema/author-verification";

export class AuthorVerificationRepository {
  constructor(private db: Database) {}

  async create(data: NewAuthorVerification): Promise<AuthorVerification> {
    const [row] = await this.db
      .insert(authorVerification)
      .values(data)
      .returning();
    return row;
  }

  async upsertPending(
    data: NewAuthorVerification,
  ): Promise<AuthorVerification> {
    const [row] = await this.db
      .insert(authorVerification)
      .values(data)
      .onConflictDoUpdate({
        target: authorVerification.gamebananaMemberId,
        set: {
          discordUserId: data.discordUserId,
          gamebananaUsername: data.gamebananaUsername,
          verificationCode: data.verificationCode,
          status: data.status,
          expiresAt: data.expiresAt,
          verifiedAt: null,
          userId: data.userId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async findPendingByDiscordUserId(
    discordUserId: string,
  ): Promise<AuthorVerification | null> {
    const [row] = await this.db
      .select()
      .from(authorVerification)
      .where(
        and(
          eq(authorVerification.discordUserId, discordUserId),
          eq(authorVerification.status, "pending"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findVerifiedByDiscordUserId(
    discordUserId: string,
  ): Promise<AuthorVerification | null> {
    const [row] = await this.db
      .select()
      .from(authorVerification)
      .where(
        and(
          eq(authorVerification.discordUserId, discordUserId),
          eq(authorVerification.status, "verified"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findByGamebananaMemberId(
    memberId: number,
  ): Promise<AuthorVerification | null> {
    const [row] = await this.db
      .select()
      .from(authorVerification)
      .where(eq(authorVerification.gamebananaMemberId, memberId))
      .limit(1);
    return row ?? null;
  }

  async markVerified(
    id: string,
    userId: string | null,
  ): Promise<AuthorVerification> {
    const [row] = await this.db
      .update(authorVerification)
      .set({
        status: "verified",
        verifiedAt: new Date(),
        userId,
        updatedAt: new Date(),
      })
      .where(eq(authorVerification.id, id))
      .returning();
    return row;
  }

  async resolveUserIdFromDiscord(
    discordUserId: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: account.userId })
      .from(account)
      .where(
        and(
          eq(account.providerId, "discord"),
          eq(account.accountId, discordUserId),
        ),
      )
      .limit(1);
    return row?.userId ?? null;
  }

  async linkGamebananaMemberToUser(
    userId: string,
    gamebananaMemberId: number,
  ): Promise<void> {
    await this.db
      .update(user)
      .set({ gamebananaMemberId })
      .where(eq(user.id, userId));
  }
}
