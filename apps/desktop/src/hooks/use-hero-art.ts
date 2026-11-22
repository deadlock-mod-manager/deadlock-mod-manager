import { useHeroCatalog } from "@/hooks/use-player-stats";

export const useHeroArt = (hero: string) => {
  const { heroByName } = useHeroCatalog();
  const images = heroByName(hero)?.images;
  return {
    portrait: images?.icon_hero_card_webp ?? images?.icon_hero_card,
    backdrop: images?.background_image_webp ?? images?.background_image,
  };
};
