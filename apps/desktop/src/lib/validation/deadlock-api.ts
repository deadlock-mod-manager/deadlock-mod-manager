import { ProviderError } from "@deadlock-mods/common/client-errors";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger("deadlock-api-schema");

export const deadlockHeroSchema = z.object({
  id: z.number(),
  name: z.string(),
  class_name: z.string(),
  images: z
    .object({
      background_image: z.string().optional(),
      background_image_webp: z.string().optional(),
      icon_hero_card: z.string().optional(),
      icon_hero_card_webp: z.string().optional(),
      icon_image_small: z.string().optional(),
      icon_image_small_webp: z.string().optional(),
      name_image: z.string().optional(),
    })
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

export const heroLoadoutSchema = z.object({
  models: z.object({ hero_select: z.string().optional() }).default({}),
  items: z.record(z.string(), z.string()).default({}),
});

export const abilityAssetSchema = z.object({
  class_name: z.string(),
  name: z.string(),
  image: z.string().nullish(),
  image_webp: z.string().nullish(),
});

export const rankAssetSchema = z.object({
  tier: z.number(),
  name: z.string(),
  color: z.string().nullish().catch(null),
  images: z.record(z.string(), z.string()).default({}),
});

export type DeadlockHero = z.infer<typeof deadlockHeroSchema>;
export type DeadlockItem = z.infer<typeof deadlockItemSchema>;
export type RankAsset = z.infer<typeof rankAssetSchema>;

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

export const parseOne = <T>(
  schema: z.ZodType<T>,
  data: unknown,
  endpoint: string,
): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger
      .withMetadata({ endpoint, issues: result.error.issues })
      .warn("Unparsable response");
    throw new ProviderError(
      `deadlock-api ${endpoint} returned an unexpected shape`,
    );
  }
  return result.data;
};
