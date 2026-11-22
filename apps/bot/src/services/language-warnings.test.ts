import { afterAll, describe, expect, it } from "bun:test";
import Redis from "ioredis";
import { RedisLanguageWarningStore } from "./language-warnings";

const redisUrl = process.env.LANGUAGE_MODERATION_TEST_REDIS_URL;

describe.skipIf(!redisUrl)("language warnings in Redis", () => {
  const firstClient = new Redis(redisUrl ?? "redis://127.0.0.1:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const secondClient = new Redis(redisUrl ?? "redis://127.0.0.1:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const firstStore = new RedisLanguageWarningStore(firstClient);
  const secondStore = new RedisLanguageWarningStore(secondClient);
  const guildId = `test-${crypto.randomUUID()}`;

  afterAll(() => {
    firstClient.disconnect();
    secondClient.disconnect();
  });

  it("shares warnings between clients, deduplicates concurrent deliveries, and expires the fixed window", async () => {
    const results = await Promise.all([
      firstStore.claimMessage(guildId, "user", "message-1", 60),
      secondStore.claimMessage(guildId, "user", "message-1", 60),
    ]);
    expect(results.filter((result) => result === 0)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);

    await firstStore.recordWarning(guildId, "user", 60);
    expect(
      await secondStore.claimMessage(guildId, "user", "message-2", 60),
    ).toBe(1);
    await secondStore.recordWarning(guildId, "user", 60);
    expect(
      await firstStore.claimMessage(guildId, "user", "message-3", 60),
    ).toBe(2);
    expect(
      await firstStore.claimMessage(guildId, "another-user", "message-4", 60),
    ).toBe(0);
    expect(
      await firstStore.claimMessage(
        `${guildId}-other`,
        "user",
        "message-5",
        60,
      ),
    ).toBe(0);

    const warningKey = `language-moderation:${guildId}:user:warnings`;
    expect(await firstClient.ttl(warningKey)).toBeGreaterThan(0);
    await firstClient.pexpire(warningKey, 5000);
    await firstStore.recordWarning(guildId, "user", 60);
    // Later warnings must not restart the original window.
    expect(await firstClient.pttl(warningKey)).toBeLessThanOrEqual(5000);
    expect(
      await secondStore.claimMessage(guildId, "user", "message-6", 60),
    ).toBe(3);
    await firstClient.pexpire(warningKey, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      await secondStore.claimMessage(guildId, "user", "message-7", 60),
    ).toBe(0);
  });
});
