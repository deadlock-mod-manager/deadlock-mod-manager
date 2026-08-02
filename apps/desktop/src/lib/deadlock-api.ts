import { fetch } from "./fetch";

const HEROES_API = "https://assets.deadlock-api.com/v2/heroes";
const ITEMS_API = "https://assets.deadlock-api.com/v2/items";
const HERO_API = `${HEROES_API}/by-name`;

export interface DeadlockHero {
  id: number;
  name: string;
  class_name: string;
  images: {
    icon_hero_card?: string;
    icon_hero_card_webp?: string;
    icon_image_small?: string;
    icon_image_small_webp?: string;
  };
}

/** Every playable hero, for id -> name/portrait lookups. Changes only per patch. */
export const getHeroes = async (): Promise<DeadlockHero[]> => {
  const res = await fetch(`${HEROES_API}?only_active=true`);
  if (!res.ok) {
    throw new Error(`Failed to load heroes: ${res.status}`);
  }
  return res.json();
};

export interface DeadlockItem {
  id: number;
  name: string;
  type: string;
  item_slot_type?: string;
  item_tier?: number;
  cost?: number | null;
  image?: string;
  image_webp?: string;
  shop_image?: string;
  shop_image_webp?: string;
}

/**
 * Buyable upgrades only. The raw asset list is ~5.7 MB of abilities and weapons
 * too, none of which show up in build statistics, so it is trimmed before it
 * ever reaches the cache.
 */
export const getItems = async (): Promise<DeadlockItem[]> => {
  const res = await fetch(`${ITEMS_API}?only_active=true`);
  if (!res.ok) {
    throw new Error(`Failed to load items: ${res.status}`);
  }
  const items = (await res.json()) as DeadlockItem[];
  return items
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

export const getHeroByName = async (
  name: string,
): Promise<DeadlockHero | null> => {
  const res = await fetch(`${HERO_API}/${encodeURIComponent(name)}`);
  if (!res.ok) {
    return null;
  }
  return res.json();
};
