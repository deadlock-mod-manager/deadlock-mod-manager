import type { ModDto } from "@deadlock-mods/shared";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { useId } from "react";
import { useHeroCatalog } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { pickStable } from "@/lib/mods/stable-pick";
import { getTopHero } from "@/lib/mods/top-hero";
import { cn } from "@/lib/utils";

// GameBanana serves this placeholder for members without an uploaded avatar.
const isGameBananaDefaultAvatar = (url: string) =>
  url.includes("gamebanana.com/static/img/defaults/");

interface AuthorAvatarSource {
  hdAvatarUrl?: string | null;
  avatarUrl?: string | null;
}

const getAvatarUrl = (author: AuthorAvatarSource | undefined) =>
  [author?.hdAvatarUrl, author?.avatarUrl].find(
    (url) => url && !isGameBananaDefaultAvatar(url),
  ) ?? undefined;

const portraitUrl = (hero: DeadlockHero | undefined) =>
  hero?.images.icon_image_small_webp ?? hero?.images.icon_image_small;

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

const SIZES = {
  sm: { root: "h-8 w-8", initials: "text-xs", portrait: "translate-y-0.5" },
  lg: {
    root: "h-24 w-24 border-2 border-background shadow-lg",
    initials: "text-3xl",
    portrait: "translate-y-2",
  },
};

interface AuthorAvatarProps {
  name: string;
  /** Absent while the profile loads; the hero fallback still renders. */
  author?: AuthorAvatarSource;
  /** Mods used to pick the hero shown when the author has no avatar. */
  mods?: Pick<ModDto, "hero">[];
  size?: keyof typeof SIZES;
}

export const AuthorAvatar = ({
  name,
  author,
  mods = [],
  size = "lg",
}: AuthorAvatarProps) => {
  const { heroByName, heroesById, isPending } = useHeroCatalog();
  const topHero = getTopHero(mods);
  const namedPortrait = portraitUrl(topHero ? heroByName(topHero) : undefined);
  const fallbackPortraits = [...heroesById.values()]
    .sort((left, right) => left.id - right.id)
    .flatMap((hero) => {
      const url = portraitUrl(hero);
      return url ? [url] : [];
    });
  const heroPortrait = namedPortrait ?? pickStable(fallbackPortraits, name);
  const sizes = SIZES[size];
  // useId output contains colons, which break the url(#id) reference.
  const duotoneId = `author-duotone-${useId().replace(/:/g, "")}`;

  return (
    <Avatar className={sizes.root}>
      <AvatarImage alt={name} src={getAvatarUrl(author)} />
      <AvatarFallback
        className={cn(
          "bg-primary/10 font-semibold text-primary",
          sizes.initials,
        )}>
        {heroPortrait ? (
          // Duotone via an SVG filter: CSS masks would need CORS headers the
          // deadlock-api asset bucket does not send.
          <>
            <svg aria-hidden='true' className='absolute h-0 w-0'>
              <filter colorInterpolationFilters='sRGB' id={duotoneId}>
                <feColorMatrix result='grey' type='saturate' values='0' />
                <feFlood
                  result='tint'
                  style={{ floodColor: "hsl(var(--primary))" }}
                />
                <feBlend in='tint' in2='grey' mode='color' result='toned' />
                <feComposite in='toned' in2='SourceAlpha' operator='in' />
              </filter>
            </svg>
            <img
              alt=''
              aria-hidden='true'
              className={cn("h-full w-full object-contain", sizes.portrait)}
              src={heroPortrait}
              style={{ filter: `url(#${duotoneId}) contrast(1.25)` }}
            />
          </>
        ) : (
          !isPending && getInitials(name)
        )}
      </AvatarFallback>
    </Avatar>
  );
};
