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

export const ASSETS_BASE_URL = "https://api.deadlock-api.com";
export const assetsBaseUrl = (): string =>
  runtimeServiceOrigin("assets", ASSETS_BASE_URL);

export class DeadlockApiError extends ProviderError {
  constructor(
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(`deadlock-api ${endpoint} failed with ${status}`);
  }
}

export const getHeroes = async (): Promise<DeadlockHero[]> => {
  const res = await fetch(
    `${assetsBaseUrl()}/v1/assets/heroes?only_active=true`,
  );
  if (!res.ok) {
    throw new DeadlockApiError(res.status, "/v1/assets/heroes");
  }
  return parseList(deadlockHeroSchema, await res.json(), "/v1/assets/heroes");
};

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
  className: string;
  image: string | null;
}

export interface HeroAbilitySet {
  modelDirectory: string;
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
