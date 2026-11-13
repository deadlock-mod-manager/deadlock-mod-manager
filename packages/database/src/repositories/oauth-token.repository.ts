import { inArray, lt } from "drizzle-orm";
import type { Database } from "../client";
import { oauthAccessToken, oauthRefreshToken } from "../schema/auth";

/**
 * Better Auth's OAuth provider never deletes the tokens it issues. It rejects
 * an expired token before it checks revocation or rotation reuse, so an expired
 * row no longer affects any request and is safe to delete.
 *
 * Batches walk the `expires_at` index in order: an unordered LIMIT lets the
 * planner seq-scan past the rows earlier batches deleted but vacuum has not
 * yet reclaimed.
 */
export class OAuthTokenRepository {
  constructor(private readonly db: Database) {}

  /** Deletes up to `limit` access tokens that expired before `cutoff`. */
  async deleteExpiredAccessTokens(cutoff: Date, limit: number) {
    const expired = this.db
      .select({ id: oauthAccessToken.id })
      .from(oauthAccessToken)
      .where(lt(oauthAccessToken.expiresAt, cutoff))
      .orderBy(oauthAccessToken.expiresAt)
      .limit(limit);
    const result = await this.db
      .delete(oauthAccessToken)
      .where(inArray(oauthAccessToken.id, expired));
    return result.rowCount ?? 0;
  }

  /**
   * Deletes up to `limit` refresh tokens that expired before `cutoff`, along
   * with the access tokens issued from them.
   */
  async deleteExpiredRefreshTokens(cutoff: Date, limit: number) {
    const expired = this.db
      .select({ id: oauthRefreshToken.id })
      .from(oauthRefreshToken)
      .where(lt(oauthRefreshToken.expiresAt, cutoff))
      .orderBy(oauthRefreshToken.expiresAt)
      .limit(limit);
    const result = await this.db
      .delete(oauthRefreshToken)
      .where(inArray(oauthRefreshToken.id, expired));
    return result.rowCount ?? 0;
  }
}
