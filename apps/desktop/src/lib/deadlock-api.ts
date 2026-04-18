import { fetch } from "./fetch";

const HERO_API = "https://assets.deadlock-api.com/v2/heroes/by-name";

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

export const getHeroByName = async (name: string): Promise<DeadlockHero> => {
  const res = await fetch(`${HERO_API}/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(`Failed to load hero ${name}: ${res.status}`);
  }
  return res.json();
};
