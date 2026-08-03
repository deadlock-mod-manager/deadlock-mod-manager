import { ProviderError } from "@deadlock-mods/common/client-errors";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

/**
 * Schemas for everything deadlock-api sends us. The responses are external JSON
 * that the app renders and does arithmetic on, so they get parsed here rather
 * than cast at each call site.
 */

const logger = createLogger("deadlock-api-schema");

export const deadlockHeroSchema = z.object({
  id: z.number(),
  name: z.string(),
  class_name: z.string(),
  images: z
    .object({
      icon_hero_card: z.string().optional(),
      icon_hero_card_webp: z.string().optional(),
      icon_image_small: z.string().optional(),
      icon_image_small_webp: z.string().optional(),
    })
    // A hero without artwork is still a hero the id lookup needs.
    .default({}),
});

export const deadlockItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  item_slot_type: z.string().optional(),
  item_tier: z.number().optional(),
  cost: z.number().nullable().optional(),
  image: z.string().optional(),
  image_webp: z.string().optional(),
  shop_image: z.string().optional(),
  shop_image_webp: z.string().optional(),
});

export const rankAssetSchema = z.object({
  tier: z.number(),
  name: z.string(),
  images: z.record(z.string(), z.string()).default({}),
});

export type DeadlockHero = z.infer<typeof deadlockHeroSchema>;
export type DeadlockItem = z.infer<typeof deadlockItemSchema>;
export type RankAsset = z.infer<typeof rankAssetSchema>;

/**
 * Parses a list response. A payload that is not a list at all is a broken
 * contract and throws like any other failed request; single entries that no
 * longer match are dropped, because one unexpected hero should not empty the
 * whole roster.
 */
export const parseList = <T>(
  schema: z.ZodType<T>,
  data: unknown,
  endpoint: string,
): T[] => {
  if (!Array.isArray(data)) {
    throw new ProviderError(`deadlock-api ${endpoint} did not return a list`);
  }
  const parsed = data.flatMap((entry) => {
    const result = schema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
  if (parsed.length !== data.length) {
    logger
      .withMetadata({ endpoint, dropped: data.length - parsed.length })
      .warn("Dropped unparsable entries");
  }
  return parsed;
};
