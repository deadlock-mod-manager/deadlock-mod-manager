import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import type { Database } from "../client";
import * as schema from "../schema";
import {
  oauthAccessToken,
  oauthClient,
  oauthRefreshToken,
  session,
  user,
} from "../schema/auth";
import { OAuthTokenRepository } from "./oauth-token.repository";

const testDatabaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
const HOUR = 60 * 60 * 1000;

// Uses a fresh database on the explicitly supplied test server, never DATABASE_URL.
describe.skipIf(!testDatabaseUrl)("deleting expired OAuth tokens", () => {
  const databaseName = `oauth_token_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: testDatabaseUrl });
  let pool: Pool;
  let database: Database;
  let databaseCreated = false;

  beforeAll(async () => {
    if (!testDatabaseUrl)
      throw new Error("An explicit test server is required");
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    const url = new URL(testDatabaseUrl);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString() });
    database = drizzle(pool, { schema });
    const statements = await generateMigration(
      generateDrizzleJson({}),
      generateDrizzleJson({
        user,
        session,
        oauthClient,
        oauthRefreshToken,
        oauthAccessToken,
      }),
    );
    for (const statement of statements) {
      await pool.query(statement);
    }
  });

  afterAll(async () => {
    await pool?.end();
    if (databaseCreated) {
      await admin.query(`DROP DATABASE "${databaseName}"`);
    }
    await admin.end();
  });

  it("deletes only expired tokens, in batches, with their access tokens", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - HOUR);
    const future = new Date(now.getTime() + HOUR);
    const [owner] = await database
      .insert(user)
      .values({
        name: "Player",
        email: "player@example.com",
        emailVerified: true,
      })
      .returning();
    if (!owner) throw new Error("Test user was not created");
    await database
      .insert(oauthClient)
      .values({ clientId: "desktop", redirectUris: [] });
    const refreshToken = (
      token: string,
      expiresAt: Date,
      rotatedAt: Date | null = null,
    ) => ({
      token,
      clientId: "desktop",
      userId: owner.id,
      scopes: ["openid"],
      createdAt: past,
      expiresAt,
      revoked: rotatedAt,
      rotatedAt,
    });
    const refreshRows = await database
      .insert(oauthRefreshToken)
      .values([
        refreshToken("expired-1", past),
        refreshToken("expired-2", past),
        refreshToken("expired-3", past),
        refreshToken("live", future),
        // A rotated token stays until it expires: presenting it again is how
        // the provider detects reuse and revokes the token family.
        refreshToken("rotated-live", future, past),
      ])
      .returning();
    const expiredRefreshId = refreshRows.find(
      (row) => row.token === "expired-1",
    )?.id;
    const accessToken = (
      token: string,
      expiresAt: Date,
      refreshId: string | null = null,
    ) => ({
      token,
      clientId: "desktop",
      userId: owner.id,
      scopes: ["openid"],
      createdAt: past,
      expiresAt,
      refreshId,
    });
    await database
      .insert(oauthAccessToken)
      .values([
        accessToken("access-expired", past),
        accessToken("access-live", future),
        accessToken(
          "access-live-from-expired-refresh",
          future,
          expiredRefreshId,
        ),
      ]);
    const repository = new OAuthTokenRepository(database);

    expect(await repository.deleteExpiredAccessTokens(now, 10)).toBe(1);
    expect(await repository.deleteExpiredRefreshTokens(now, 2)).toBe(2);
    expect(await repository.deleteExpiredRefreshTokens(now, 2)).toBe(1);
    expect(await repository.deleteExpiredRefreshTokens(now, 2)).toBe(0);

    const remainingRefresh = await database
      .select({ token: oauthRefreshToken.token })
      .from(oauthRefreshToken)
      .orderBy(oauthRefreshToken.token);
    expect(remainingRefresh.map((row) => row.token)).toEqual([
      "live",
      "rotated-live",
    ]);
    const remainingAccess = await database
      .select({ token: oauthAccessToken.token })
      .from(oauthAccessToken);
    expect(remainingAccess.map((row) => row.token)).toEqual(["access-live"]);
  });
});
