import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import {
  useHeroCatalog,
  useRefreshHeroCatalogOnMiss,
} from "@/hooks/use-player-stats";
import { cn } from "@/lib/utils";

interface HeroIconProps {
  /** Display name or codename. Empty renders a blank slot so lists stay aligned. */
  hero: string | null | undefined;
  /** `card` is the taller portrait art; `small` is the square minimap icon. */
  variant?: "small" | "card";
  className?: string;
}

export const HeroIcon = ({
  hero,
  variant = "small",
  className,
}: HeroIconProps) => {
  const { heroByName } = useHeroCatalog();
  const assets = hero ? heroByName(hero) : undefined;
  useRefreshHeroCatalogOnMiss(Boolean(hero) && !assets);
  const small =
    assets?.images.icon_image_small_webp ?? assets?.images.icon_image_small;
  const image =
    variant === "card"
      ? (assets?.images.icon_hero_card_webp ??
        assets?.images.icon_hero_card ??
        small)
      : small;

  return (
    <Avatar className={cn("h-5 w-5 shrink-0 rounded-sm", className)}>
      {image && <AvatarImage alt='' src={image} />}
      <AvatarFallback className='rounded-[inherit] text-[10px]'>
        {(assets?.name ?? hero ?? "").charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
};
