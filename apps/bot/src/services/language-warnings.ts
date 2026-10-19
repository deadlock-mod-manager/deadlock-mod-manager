import type Redis from "ioredis";
import { z } from "zod";

export interface LanguageWarningStore {
  claimMessage(
    guildId: string,
    userId: string,
    messageId: string,
    windowSeconds: number,
  ): Promise<number | null>;
  recordWarning(
    guildId: string,
    userId: string,
    windowSeconds: number,
  ): Promise<void>;
}

const claimMessageScript = `
if not redis.call("SET", KEYS[2], "1", "EX", ARGV[1], "NX") then
  return -1
end
return tonumber(redis.call("GET", KEYS[1]) or "0")
`;

const recordWarningScript = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

export class RedisLanguageWarningStore implements LanguageWarningStore {
  constructor(private readonly redis: Pick<Redis, "eval">) {}

  async claimMessage(
    guildId: string,
    userId: string,
    messageId: string,
    windowSeconds: number,
  ): Promise<number | null> {
    const count = z
      .number()
      .int()
      .min(-1)
      .parse(
        await this.redis.eval(
          claimMessageScript,
          2,
          `language-moderation:${guildId}:${userId}:warnings`,
          `language-moderation:${guildId}:${messageId}:processed`,
          windowSeconds,
        ),
      );
    return count === -1 ? null : count;
  }

  async recordWarning(
    guildId: string,
    userId: string,
    windowSeconds: number,
  ): Promise<void> {
    await this.redis.eval(
      recordWarningScript,
      1,
      `language-moderation:${guildId}:${userId}:warnings`,
      windowSeconds,
    );
  }
}
