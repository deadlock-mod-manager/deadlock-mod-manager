import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { cn } from "@/lib/utils";

interface HeroAvatarProps {
  hero: DeadlockHero | undefined;
  heroId: number;
  className?: string;
}

export const HeroAvatar = ({ hero, heroId, className }: HeroAvatarProps) => {
  const image =
    hero?.images.icon_image_small_webp ?? hero?.images.icon_image_small;

  return (
    <Avatar className={cn("h-8 w-8 rounded-md", className)}>
      {image && <AvatarImage alt={hero?.name ?? ""} src={image} />}
      <AvatarFallback className='rounded-md text-xs'>
        {hero?.name?.charAt(0) ?? heroId}
      </AvatarFallback>
    </Avatar>
  );
};
