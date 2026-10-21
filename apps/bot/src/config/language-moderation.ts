import { z } from "zod";

const channelListSchema = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );

const channelIdSchema = z.string().regex(/^\d+$/);

export const languageModerationEnvSchema = z.object({
  LANGUAGE_MODERATION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  LANGUAGE_MODERATION_CHANNEL_IDS: channelListSchema.pipe(
    z.array(z.union([channelIdSchema, z.literal("*")])),
  ),
  LANGUAGE_MODERATION_IGNORED_CHANNEL_IDS: channelListSchema.pipe(
    z.array(channelIdSchema),
  ),
  LANGUAGE_MODERATION_MAX_WARNINGS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3),
  LANGUAGE_MODERATION_WINDOW_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(30),
});

export interface LanguageModerationConfig {
  enabled: boolean;
  guildId: string;
  channelIds: string[];
  ignoredChannelIds: string[];
  maxWarnings: number;
  windowMinutes: number;
}

export function isLanguageModerationChannel(
  config: LanguageModerationConfig,
  guildId: string | null,
  channelId: string,
  parentId: string | null,
): boolean {
  if (!config.enabled || guildId !== config.guildId) return false;
  const ids = parentId ? [channelId, parentId] : [channelId];
  return (
    !ids.some((id) => config.ignoredChannelIds.includes(id)) &&
    (config.channelIds.includes("*") ||
      ids.some((id) => config.channelIds.includes(id)))
  );
}
