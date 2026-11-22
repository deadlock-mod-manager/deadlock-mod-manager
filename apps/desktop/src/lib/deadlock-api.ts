import { ProviderError } from "@deadlock-mods/common/client-errors";
import type { z } from "zod";
import {
  abilityAssetSchema,
  type DeadlockHero,
  deadlockHeroSchema,
  type DeadlockItem,
  deadlockItemSchema,
  heroLoadoutSchema,
  parseList,
} from "./validation/deadlock-api";
import { fetch } from "./fetch";
import { runtimeServiceOrigin } from "./runtime-bootstrap";

export type { DeadlockHero, DeadlockItem };

// assets.deadlock-api.com was retired; the asset routes now live under /v1/assets.
export const ASSETS_BASE_URL = "https://api.deadlock-api.com";
export const assetsBaseUrl = (): string =>
  runtimeServiceOrigin("assets", ASSETS_BASE_URL);

/**
 * Every deadlock-api failure, on the app's shared error hierarchy. Lives here
 * rather than in `stats/api.ts` so the asset and the stats client can both throw
 * it without importing each other.
 */
export class DeadlockApiError extends ProviderError {
  constructor(
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(`deadlock-api ${endpoint} failed with ${status}`);
  }
}

/** Every playable hero, for id -> name/portrait lookups. Changes only per patch. */
export const getHeroes = async (): Promise<DeadlockHero[]> => {
  const res = await fetch(
    `${assetsBaseUrl()}/v1/assets/heroes?only_active=true`,
  );
  if (!res.ok) {
    throw new DeadlockApiError(res.status, "/v1/assets/heroes");
  }
  return parseList(deadlockHeroSchema, await res.json(), "/v1/assets/heroes");
};

/**
 * Buyable upgrades only. The raw asset list is ~5.7 MB of abilities and weapons
 * too, none of which show up in build statistics, so it is trimmed before it
 * ever reaches the cache.
 */
export const getItems = async (): Promise<DeadlockItem[]> => {
  const res = await fetch(
    `${assetsBaseUrl()}/v1/assets/items?only_active=true`,
  );
  if (!res.ok) {
    throw new DeadlockApiError(res.status, "/v1/assets/items");
  }
  return parseList(deadlockItemSchema, await res.json(), "/v1/assets/items")
    .filter((item) => item.type === "upgrade")
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      item_slot_type: item.item_slot_type,
      item_tier: item.item_tier,
      cost: item.cost,
      shop_image_webp: item.shop_image_webp,
      shop_image: item.shop_image,
    }));
};

export interface HeroAbility {
  name: string;
  /** The ability's class name without the `citadel_ability_` prefix. */
  className: string;
  image: string | null;
}

export interface HeroAbilitySet {
  /** Folder holding the hero's base model, e.g. `models/heroes_wip/abrams/`. */
  modelDirectory: string;
  /** The four signature abilities, in key order. */
  abilities: HeroAbility[];
}

const fetchList = async <T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T[]> => {
  const res = await fetch(`${assetsBaseUrl()}${path}`);
  if (!res.ok) {
    throw new DeadlockApiError(res.status, path);
  }
  return parseList(schema, await res.json(), path);
};

/**
 * Each hero's signature abilities with their icons, keyed by the folder of the
 * hero's model so a decoded skin can find its hero. The raw ability list is
 * ~4 MB, so only the four slots of every hero are kept.
 */
export const getHeroAbilities = async (): Promise<HeroAbilitySet[]> => {
  const [heroes, abilities] = await Promise.all([
    fetchList("/v1/assets/heroes?only_active=true", heroLoadoutSchema),
    fetchList("/v1/assets/items/by-type/ability", abilityAssetSchema),
  ]);
  const byClass = new Map(
    abilities.map((ability) => [ability.class_name, ability]),
  );
  return heroes.flatMap((hero) => {
    const model = hero.models.hero_select?.match(
      /\/(models\/.+\/)[^/]+\/hero_select\.glb$/,
    )?.[1];
    if (!model) return [];
    const slots = [1, 2, 3, 4].flatMap((slot) => {
      const ability = byClass.get(hero.items[`signature${slot}`] ?? "");
      return ability
        ? [
            {
              name: ability.name,
              className: ability.class_name.replace(/^citadel_ability_/, ""),
              image: ability.image_webp ?? ability.image ?? null,
            },
          ]
        : [];
    });
    return slots.length === 4
      ? [{ modelDirectory: model, abilities: slots }]
      : [];
  });
};
