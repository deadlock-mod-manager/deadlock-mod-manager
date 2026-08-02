import { fetch } from "./fetch";

const HEROES_API = "https://assets.deadlock-api.com/v2/heroes";
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

export const getHeroByName = async (
  name: string,
): Promise<DeadlockHero | null> => {
  const res = await fetch(`${HERO_API}/${encodeURIComponent(name)}`);
  if (!res.ok) {
    return null;
  }
  return res.json();
};
