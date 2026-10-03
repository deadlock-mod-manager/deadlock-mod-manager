import { ProviderError } from "@deadlock-mods/common/client-errors";
import { z } from "zod";

/**
 * Client for the community-run Deadlock assets API. Everything the randomizer
 * renders - heroes, portraits, shop items, ability icons - comes from here, so
 * the responses are parsed rather than cast: they are external JSON that the
 * roll then does arithmetic on.
 */

const ASSETS_BASE_URL = "https://api.deadlock-api.com/v1/assets";

export const ITEM_CATEGORIES = ["weapon", "vitality", "spirit"] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: "Weapon",
  vitality: "Vitality",
  spirit: "Spirit",
};

/** The ultimate always sits in the fourth signature slot. */
export const ULTIMATE_SLOT = 4;

const heroImagesSchema = z
  .object({
    icon_hero_card: z.string().optional(),
    icon_hero_card_webp: z.string().optional(),
    icon_image_small: z.string().optional(),
    icon_image_small_webp: z.string().optional(),
    minimap_image: z.string().optional(),
    minimap_image_webp: z.string().optional(),
    background_image: z.string().optional(),
    background_image_webp: z.string().optional(),
    top_bar_vertical_image: z.string().optional(),
    top_bar_vertical_image_webp: z.string().optional(),
    /** The hero's wordmark, as an SVG. */
    name_image: z.string().optional(),
  })
  .default({});

const slotInfoSchema = z.object({
  max_purchases_for_tier: z.array(z.number()).default([]),
});

/**
 * Valve's own per-hero verdict on every draftable item: which pool it is in,
 * and how strongly it fits. The randomizer treats a hero's bucketing map as
 * that hero's shop - an item missing from it is one this hero does not draft.
 */
const draftBucketSchema = z.object({
  bucket: z.string().default("Normal"),
  weight: z.number().default(1),
});

/**
 * One step of the hero's level table. Each level hands out either an ability
 * unlock or an ability point, and the order they come in decides which
 * abilities can take points first.
 */
const levelSchema = z.object({
  required_gold: z.number().default(0),
  bonus_currencies: z.array(z.string()).default([]),
});

export const heroSchema = z.object({
  id: z.number(),
  class_name: z.string(),
  name: z.string(),
  complexity: z.number().default(1),
  player_selectable: z.boolean().default(false),
  disabled: z.boolean().default(false),
  in_development: z.boolean().default(false),
  hero_type: z.string().nullish(),
  gun_tag: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  description: z
    .object({
      lore: z.string().nullish(),
      role: z.string().nullish(),
      playstyle: z.string().nullish(),
    })
    .default({}),
  images: heroImagesSchema,
  items: z.record(z.string(), z.string()).default({}),
  item_slot_info: z.record(z.string(), slotInfoSchema).default({}),
  item_draft_bucketing: z.record(z.string(), draftBucketSchema).default({}),
  level_info: z.record(z.string(), levelSchema).default({}),
  colors: z
    .object({
      ui: z.array(z.number()).optional(),
      style_hex: z.string().optional(),
    })
    .default({}),
  shop_stat_display: z
    .object({
      weapon_stats_display: z
        .object({
          weapon_attributes: z.array(z.string()).nullish(),
        })
        .default({}),
    })
    .nullish(),
});

/**
 * One stat an item can show in its tooltip. Prefix and postfix are the shop's
 * own formatting - `{s:sign}` asks for an explicit plus on positive values.
 */
const itemPropertySchema = z
  .object({
    value: z.union([z.string(), z.number()]).nullish(),
    label: z.string().nullish(),
    prefix: z.string().nullish(),
    postfix: z.string().nullish(),
  })
  .catch({});

/**
 * How the shop lays out an item's tooltip: an innate block of stats, then a
 * passive or active block with its text and the stats that belong to it. Many
 * items have no `description` at all and only exist here.
 */
const tooltipSectionSchema = z
  .object({
    section_type: z.string().nullish(),
    section_attributes: z
      .array(
        z.object({
          loc_string: z.string().nullish(),
          properties: z.array(z.string()).nullish(),
          elevated_properties: z.array(z.string()).nullish(),
          important_properties: z.array(z.string()).nullish(),
        }),
      )
      .default([]),
  })
  .catch({ section_attributes: [] });

export const upgradeSchema = z.object({
  id: z.number(),
  class_name: z.string(),
  name: z.string(),
  type: z.string(),
  item_slot_type: z.enum(ITEM_CATEGORIES),
  item_tier: z.number(),
  cost: z.number().nullish(),
  shopable: z.boolean().default(false),
  is_active_item: z.boolean().nullish(),
  imbue: z.string().nullish(),
  component_items: z.array(z.string()).nullish(),
  shop_image: z.string().nullish(),
  shop_image_webp: z.string().nullish(),
  properties: z.record(z.string(), itemPropertySchema).catch({}).default({}),
  tooltip_sections: z.array(tooltipSectionSchema).catch([]).default([]),
  description: z
    .object({
      desc: z.string().nullish(),
    })
    .default({}),
});

/**
 * Property values arrive as strings or numbers depending on the property. An
 * entry that does not fit is dropped instead of failing the whole ability, so
 * a new property shape never costs the page its ability icons.
 */
const propertyValueSchema = z
  .object({ value: z.union([z.string(), z.number()]).nullish() })
  .catch({});

const abilityUpgradeSchema = z
  .object({
    property_upgrades: z
      .array(
        z.object({
          name: z.string(),
          bonus: z.union([z.string(), z.number()]).nullish(),
        }),
      )
      .default([]),
  })
  .catch({ property_upgrades: [] });

export const abilitySchema = z.object({
  id: z.number(),
  class_name: z.string(),
  name: z.string(),
  type: z.string(),
  ability_type: z.string().nullish(),
  image: z.string().nullish(),
  image_webp: z.string().nullish(),
  properties: z.record(z.string(), propertyValueSchema).catch({}).default({}),
  upgrades: z.array(abilityUpgradeSchema).catch([]).default([]),
});

export type DeadlockHero = z.infer<typeof heroSchema>;
export type DeadlockUpgrade = z.infer<typeof upgradeSchema>;
export type DeadlockAbility = z.infer<typeof abilitySchema>;

/** On the app's shared error hierarchy, so it carries a stable error code. */
class DeadlockAssetsError extends ProviderError {
  constructor(
    readonly endpoint: string,
    readonly status: number,
  ) {
    super(`deadlock assets ${endpoint} responded ${status}`);
  }
}

/**
 * A single hero or item that no longer matches its schema is dropped instead of
 * failing the request - the assets API ships new fields every patch, and one
 * unparsable entry should not empty the whole roster. A response that yields
 * nothing usable throws rather than returning an empty list, because the page
 * cannot tell an empty roster from a roster it is still waiting for and would
 * sit on its loading state forever.
 */
const parseList = <T>(
  schema: z.ZodType<T>,
  data: unknown,
  endpoint: string,
): T[] => {
  if (!Array.isArray(data)) {
    throw new ProviderError(
      `deadlock assets ${endpoint} did not return a list`,
    );
  }
  const parsed = data.flatMap((entry) => {
    const result = schema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
  if (data.length > 0 && parsed.length === 0) {
    throw new ProviderError(
      `deadlock assets ${endpoint} returned nothing usable`,
    );
  }
  return parsed;
};

/**
 * A response that parsed fine but filtered down to nothing means the API
 * changed shape under us: a build with no heroes or no items is worse than an
 * error, so it is reported as one. A genuinely empty response stays valid.
 */
const requireSome = <T>(parsed: T[], kept: T[], endpoint: string): T[] => {
  if (parsed.length > 0 && kept.length === 0) {
    throw new ProviderError(
      `deadlock assets ${endpoint} returned nothing usable`,
    );
  }
  return kept;
};

const request = async (endpoint: string): Promise<unknown> => {
  const response = await fetch(`${ASSETS_BASE_URL}${endpoint}`);
  if (!response.ok) {
    throw new DeadlockAssetsError(endpoint, response.status);
  }
  return response.json();
};

export const getHeroes = async (): Promise<DeadlockHero[]> => {
  const endpoint = "/heroes?only_active=true";
  const heroes = parseList(heroSchema, await request(endpoint), endpoint);
  const selectable = heroes.filter(
    (hero) => hero.player_selectable && !hero.disabled && !hero.in_development,
  );
  return requireSome(heroes, selectable, endpoint);
};

/**
 * Items the game has data for but no real price yet all carry the same
 * placeholder cost. They are not buyable in a match, so the randomizer must
 * never put one in a build.
 */
const UNPRICED_ITEM_COST = 9999;

const isBuyable = (upgrade: DeadlockUpgrade): boolean =>
  upgrade.shopable &&
  upgrade.cost !== null &&
  upgrade.cost !== undefined &&
  upgrade.cost > 0 &&
  upgrade.cost !== UNPRICED_ITEM_COST;

export const getUpgrades = async (): Promise<DeadlockUpgrade[]> => {
  const endpoint = "/items/by-type/upgrade";
  const upgrades = parseList(upgradeSchema, await request(endpoint), endpoint);
  return requireSome(upgrades, upgrades.filter(isBuyable), endpoint);
};

/**
 * Every upgradable ability in the game, keyed by class name so a hero's four
 * slots resolve without a request of their own. Fetching per hero instead
 * would put a round trip between every reroll and its icons, and a player
 * rerolling quickly would outrun the API.
 */
export const getAbilities = async (): Promise<Map<string, DeadlockAbility>> => {
  const endpoint = "/items/by-type/ability";
  const abilities = parseList(abilitySchema, await request(endpoint), endpoint);
  return new Map(
    abilities
      .filter(
        (ability) =>
          ability.ability_type === "signature" ||
          ability.ability_type === "ultimate",
      )
      .map((ability) => [ability.class_name, ability]),
  );
};

/**
 * Whether an ability runs on charges, either from the start or once one of its
 * own upgrades adds them. Items like Extra Charge only ever touch abilities
 * like these, so a hero without one gets nothing out of them.
 */
export const isChargedAbility = (ability: DeadlockAbility): boolean =>
  Number(ability.properties.AbilityCharges?.value ?? 0) > 0 ||
  ability.upgrades.some((upgrade) =>
    upgrade.property_upgrades.some(
      (property) =>
        property.name === "AbilityCharges" && Number(property.bonus ?? 0) > 0,
    ),
  );

/** A readable, stable URL key for a hero - `mo-krill`, `the-doorman`. */
export const heroSlug = (hero: DeadlockHero): string =>
  hero.name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

export const heroImage = (
  hero: DeadlockHero,
  key: "card" | "background" | "vertical" | "small" | "minimap" | "name",
): string | undefined => {
  const { images } = hero;
  switch (key) {
    case "card":
      return images.icon_hero_card_webp ?? images.icon_hero_card;
    case "background":
      return images.background_image_webp ?? images.background_image;
    case "vertical":
      return (
        images.top_bar_vertical_image_webp ?? images.top_bar_vertical_image
      );
    case "small":
      return images.icon_image_small_webp ?? images.icon_image_small;
    case "minimap":
      return images.minimap_image_webp ?? images.minimap_image;
    case "name":
      return images.name_image;
  }
};

interface TooltipStat {
  label: string;
  value: string;
}

export interface TooltipSection {
  /** `innate`, `passive` or `active`, as the shop names them. */
  kind?: string;
  /** Still carries the shop's markup; strip it before rendering. */
  text?: string;
  stats: TooltipStat[];
}

/** A stat as the shop prints it, or nothing when it has no real value. */
const formatStat = (
  property: DeadlockUpgrade["properties"][string] | undefined,
): TooltipStat | undefined => {
  const number = Number(property?.value);
  if (!property?.label || !Number.isFinite(number) || number === 0) {
    return undefined;
  }
  const sign =
    property.prefix === "{s:sign}"
      ? number > 0
        ? "+"
        : ""
      : (property.prefix ?? "");
  return {
    label: property.label,
    value: `${sign}${number}${property.postfix ?? ""}`,
  };
};

/** The item's tooltip, section by section, the way the shop shows it. */
export const itemTooltip = (item: DeadlockUpgrade): TooltipSection[] =>
  item.tooltip_sections
    .flatMap((section) =>
      section.section_attributes.map((attribute) => ({
        kind: section.section_type ?? undefined,
        text: attribute.loc_string ?? undefined,
        stats: [
          ...(attribute.elevated_properties ?? []),
          ...(attribute.important_properties ?? []),
          ...(attribute.properties ?? []),
        ].flatMap((name) => {
          const stat = formatStat(item.properties[name]);
          return stat ? [stat] : [];
        }),
      })),
    )
    .filter((section) => section.text || section.stats.length > 0);

export const itemImage = (item: DeadlockUpgrade): string | undefined =>
  item.shop_image_webp ?? item.shop_image ?? undefined;

export const abilityImage = (ability: DeadlockAbility): string | undefined =>
  ability.image_webp ?? ability.image ?? undefined;

/** The hero's UI colour as an `R G B` triplet, ready for `rgb(var(--hero))`. */
export const heroAccent = (hero: DeadlockHero): string => {
  const [r, g, b] = hero.colors.ui ?? [];
  if (r === undefined || g === undefined || b === undefined) {
    return "255 237 121";
  }
  return `${r} ${g} ${b}`;
};
