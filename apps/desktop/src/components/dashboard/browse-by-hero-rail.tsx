import { DeadlockHeroes } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  CaretLeftIcon,
  CaretRightIcon,
  DiceFiveIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HeroIcon } from "@/components/heroes/hero-icon";
import { useIsHeroAvailable } from "@/hooks/use-player-stats";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const SCROLL_AMOUNT = 600;
// Long enough to see where the roll landed, short enough not to feel like a wait.
const ROLL_REVEAL_MS = 450;

export const BrowseByHeroRail = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const rollTimeout = useRef<number | undefined>(undefined);
  const [rolledHero, setRolledHero] = useState<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isHeroAvailable = useIsHeroAvailable();
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );

  const heroes = useMemo(
    () =>
      Object.values(DeadlockHeroes)
        .filter(isHeroAvailable)
        .sort((a, b) => a.localeCompare(b)),
    [isHeroAvailable],
  );

  useEffect(() => () => window.clearTimeout(rollTimeout.current), []);

  const handleSelect = useCallback(
    (hero: string) => {
      updateModsFilters({ selectedHeroes: [hero], selectedCategories: [] });
      navigate("/mods");
    },
    [navigate, updateModsFilters],
  );

  const handleRoll = useCallback(() => {
    if (rolledHero) return;
    const hero = heroes[Math.floor(Math.random() * heroes.length)];
    if (prefersReducedMotion) {
      handleSelect(hero);
      return;
    }
    setRolledHero(hero);
    tileRefs.current.get(hero)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    rollTimeout.current = window.setTimeout(
      () => handleSelect(hero),
      ROLL_REVEAL_MS,
    );
  }, [handleSelect, heroes, prefersReducedMotion, rolledHero]);

  const scrollBy = useCallback((dx: number) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  }, []);

  return (
    <section className='space-y-3'>
      <header className='flex items-center justify-between gap-3'>
        <h3
          className='flex items-center gap-2 text-xl font-bold tracking-tight text-foreground lg:text-2xl'
          style={{ fontFamily: '"Forevs Demo", serif' }}>
          <UsersThreeIcon className='size-5 text-primary' weight='duotone' />
          <span className='text-white'>{t("dashboard.browseBy")}</span>{" "}
          <span className='text-primary'>{t("dashboard.hero")}</span>
        </h3>
        <div className='flex items-center gap-1'>
          <Button
            aria-label='Scroll left'
            className='size-8'
            onClick={() => scrollBy(-SCROLL_AMOUNT)}
            size='icon'
            variant='ghost'>
            <CaretLeftIcon className='size-4' />
          </Button>
          <Button
            aria-label='Scroll right'
            className='size-8'
            onClick={() => scrollBy(SCROLL_AMOUNT)}
            size='icon'
            variant='ghost'>
            <CaretRightIcon className='size-4' />
          </Button>
          <Button
            className='group/roll gap-1.5 text-xs'
            onClick={handleRoll}
            size='sm'
            variant='ghost'>
            <DiceFiveIcon
              className={cn(
                "size-3.5 transition-transform duration-300 ease-dmm-smooth",
                rolledHero
                  ? "motion-safe:rotate-[360deg]"
                  : "motion-safe:group-hover/roll:rotate-90",
              )}
            />
            {t("dashboard.randomHero")}
          </Button>
        </div>
      </header>
      <div
        className='-mx-1 flex gap-3 overflow-x-auto px-1 pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        ref={scrollerRef}
        style={{ scrollSnapType: "x proximity" }}>
        {heroes.map((hero) => {
          const isRolled = hero === rolledHero;
          return (
            <button
              className={cn(
                "group relative w-24 shrink-0 overflow-hidden rounded-lg border border-border/30 transition-colors duration-200 hover:border-primary/60 focus-visible:border-primary focus-visible:outline-none",
                isRolled && "border-primary ring-2 ring-primary/40",
              )}
              key={hero}
              onClick={() => handleSelect(hero)}
              ref={(node) => {
                if (node) tileRefs.current.set(hero, node);
                else tileRefs.current.delete(hero);
              }}
              style={{ scrollSnapAlign: "start" }}
              type='button'>
              <HeroIcon
                className={cn(
                  "h-32 w-full rounded-none [&_img]:object-cover [&_img]:object-top [&_img]:saturate-[.7] [&_img]:transition-[transform,filter] [&_img]:duration-300 [&_img]:ease-dmm-smooth group-hover:[&_img]:saturate-100 group-focus-visible:[&_img]:saturate-100 motion-safe:group-hover:[&_img]:scale-[1.06]",
                  isRolled &&
                    "[&_img]:saturate-100 motion-safe:[&_img]:scale-[1.06]",
                )}
                hero={hero}
                variant='card'
              />
              <span
                className={cn(
                  "absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background via-background/70 to-transparent px-2 pt-6 pb-1.5 text-left font-semibold text-xs transition-colors group-hover:text-primary",
                  isRolled && "text-primary",
                )}>
                {hero}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
