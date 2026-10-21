import type { ModDto } from "@deadlock-mods/shared";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalAudioStore } from "@/hooks/use-global-audio";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useWindowFocused } from "@/hooks/use-window-focused";
import { getModCategoryDisplayName } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  FeaturedModCardSkeleton,
  FeaturedModSlide,
} from "@/components/dashboard/featured-mod-card";

const AUTOPLAY_MS = 8_000;

type Props = {
  mods: ModDto[];
  isLoading?: boolean;
};

export const FeaturedModsCarousel = ({ mods, isLoading }: Props) => {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const windowFocused = useWindowFocused();
  const sectionRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  // The slide fading out underneath the incoming one.
  const [previous, setPrevious] = useState<number | null>(null);
  const activeAudioUrl = mods[selected]?.audioUrl;
  // Don't slide away from a preview the user is listening to.
  const isPreviewing = useGlobalAudioStore(
    (s) => s.isPlaying && !!activeAudioUrl && s.currentUrl === activeAudioUrl,
  );

  // Scrolled out of view, the progress bar stops (via CSS) so slides don't keep
  // swapping and decoding images nobody sees.
  const hasSection = !isLoading && mods.length > 0;
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) =>
      section.toggleAttribute("data-offscreen", !entry.isIntersecting),
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [hasSection]);

  if (isLoading) {
    return <FeaturedModCardSkeleton />;
  }
  if (mods.length === 0) {
    return null;
  }

  const count = mods.length;
  const hasMany = count > 1;
  const autoplay = hasMany && !reducedMotion;
  const goTo = (index: number) => {
    const target = (index + count) % count;
    if (target === selected) return;
    setPrevious(reducedMotion ? null : selected);
    setSelected(target);
  };
  // Crossfading stacked slides instead of sliding a strip of every slide keeps
  // each transition to one opacity animation. Only the visible slides and the
  // neighbours (so their images are loaded before they fade in) are mounted.
  const mounted = new Set([
    selected,
    (selected + 1) % count,
    (selected - 1 + count) % count,
    ...(previous === null ? [] : [previous]),
  ]);

  return (
    <section
      aria-label={t("dashboard.featuredModOfTheWeek")}
      className='featured-carousel flex select-none flex-col gap-3'
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") goTo(selected - 1);
        if (e.key === "ArrowRight") goTo(selected + 1);
      }}
      ref={sectionRef}>
      <div
        aria-roledescription='carousel'
        className='group/featured relative grid overflow-hidden rounded-lg'>
        {mods.map((mod, index) =>
          mounted.has(index) ? (
            <div
              aria-label={`${index + 1} / ${count}`}
              aria-roledescription='slide'
              className={cn(
                "[grid-area:1/1]",
                index === selected && "featured-fade-in z-20",
                index === previous && "z-10",
                index !== selected && index !== previous && "opacity-0",
              )}
              key={mod.remoteId}
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget) setPrevious(null);
              }}
              role='group'>
              <FeaturedModSlide isActive={index === selected} mod={mod} />
            </div>
          ) : null,
        )}

        {hasMany && (
          <>
            <ArrowButton
              className='left-4'
              label={t("accessibility.previousSlide")}
              onClick={() => goTo(selected - 1)}>
              <CaretLeftIcon className='size-5' weight='bold' />
            </ArrowButton>
            <ArrowButton
              className='right-4'
              label={t("accessibility.nextSlide")}
              onClick={() => goTo(selected + 1)}>
              <CaretRightIcon className='size-5' weight='bold' />
            </ArrowButton>
          </>
        )}
      </div>

      {hasMany && (
        <div
          className='grid gap-1.5'
          role='tablist'
          style={{
            gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          }}>
          {mods.map((mod, index) => {
            const isActive = index === selected;
            return (
              <button
                aria-label={`${getModCategoryDisplayName(mod.category)}: ${mod.name}`}
                aria-selected={isActive}
                className='group/tab flex min-w-0 cursor-pointer flex-col gap-2 pt-1 text-left outline-none'
                key={mod.remoteId}
                onClick={() => goTo(index)}
                role='tab'
                type='button'>
                <span className='relative h-0.5 w-full overflow-hidden rounded-full bg-muted-foreground/20 transition-colors group-hover/tab:bg-muted-foreground/40'>
                  {isActive && (
                    <span
                      className={cn(
                        "absolute inset-0 origin-left bg-primary",
                        autoplay && "featured-progress",
                      )}
                      onAnimationEnd={() => goTo(selected + 1)}
                      style={{
                        animationDuration: `${AUTOPLAY_MS}ms`,
                        ...((isPreviewing || !windowFocused) && {
                          animationPlayState: "paused",
                        }),
                      }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "truncate font-bold text-[10px] uppercase tracking-[0.2em] transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground/70 group-hover/tab:text-foreground/80 group-focus-visible/tab:text-foreground",
                  )}
                  style={{ fontFamily: '"Forevs Demo", serif' }}>
                  {getModCategoryDisplayName(mod.category)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

const ArrowButton = ({
  className,
  label,
  onClick,
  children,
}: {
  className: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    aria-label={label}
    className={cn(
      "-translate-y-1/2 absolute top-1/2 z-30 flex size-10 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-background/75 text-foreground/80 opacity-0 transition-[opacity,color,border-color] hover:border-primary/60 hover:text-primary focus-visible:opacity-100 group-hover/featured:opacity-100",
      className,
    )}
    onClick={onClick}
    title={label}
    type='button'>
    {children}
  </button>
);
