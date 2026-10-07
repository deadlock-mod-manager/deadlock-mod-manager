import { cn } from "@deadlock-mods/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type SeasonId =
  | "halloween"
  | "christmas"
  | "newYear"
  | "lunarNewYear"
  | "easter";

/** A fixed yearly window as month * 100 + day, both days included. */
interface FixedWindow {
  start: number;
  end: number;
}

/**
 * Windows match the desktop app's lib/seasonal-themes.ts. Lunar New Year and
 * Easter move every year, so they have none and are never marked in season.
 */
const SEASONS: { id: SeasonId; color: string; window?: FixedWindow }[] = [
  {
    id: "halloween",
    color: "bg-orange-400",
    window: { start: 1001, end: 1101 },
  },
  { id: "christmas", color: "bg-red-400", window: { start: 1201, end: 1226 } },
  { id: "newYear", color: "bg-amber-200", window: { start: 1227, end: 101 } },
  { id: "lunarNewYear", color: "bg-rose-500" },
  { id: "easter", color: "bg-lime-300" },
];

const inWindow = (now: Date, { start, end }: FixedWindow) => {
  const today = (now.getMonth() + 1) * 100 + now.getDate();
  // New Year's window wraps past December 31.
  return start <= end
    ? today >= start && today <= end
    : today >= start || today <= end;
};

const currentSeason = (now: Date) =>
  SEASONS.find(({ window }) => window && inWindow(now, window))?.id;

/** One bat, once, the way the Halloween theme lets them loose. */
const Bat = () => (
  <svg
    aria-hidden='true'
    viewBox='0 0 64 28'
    className='pointer-events-none absolute top-6 left-0 w-12 animate-bat-flight text-foreground/70'>
    <g className='animate-bat-flap'>
      <path
        fill='currentColor'
        d='M32 10c-2-4-1-7 0-9 1 2 2 5 0 9 3-2 7-3 10-1 4-5 12-6 20-2-5 1-8 4-9 8-3-2-7-1-9 2-2-2-5-2-7 0-2 3-3 7-5 9-2-2-3-6-5-9-2-2-5-2-7 0-2-3-6-4-9-2-1-4-4-7-9-8 8-4 16-3 20 2 3-2 7-1 10 1z'
      />
    </g>
  </svg>
);

/**
 * The five seasonal themes and when they switch on. Which one is in season
 * is worked out after hydration, from the visitor's own clock.
 */
export const Seasons = () => {
  const { t } = useTranslation("v2");
  const [season, setSeason] = useState<SeasonId>();
  const [showBat, setShowBat] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = currentSeason(new Date());
    setSeason(active);
    const element = ref.current;
    if (active !== "halloween" || !element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShowBat(true);
        observer.disconnect();
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className='relative'>
      {showBat && <Bat />}
      <ol className='divide-y divide-border border-border border-y'>
        {SEASONS.map(({ id, color }) => {
          const active = season === id;
          return (
            <li
              key={id}
              className='grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[180px_minmax(0,1fr)]'>
              <div className='flex items-center gap-2.5'>
                <span className='relative flex size-2.5'>
                  {active && (
                    <span
                      className={cn(
                        "absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping",
                        color,
                      )}
                    />
                  )}
                  <span
                    className={cn("relative size-2.5 rounded-full", color)}
                  />
                </span>
                <span className='font-semibold'>
                  {t(`features.themes.seasons.${id}.name`)}
                </span>
              </div>
              <div>
                <p className='text-muted-foreground text-sm'>
                  {active ? (
                    <span className='font-medium text-foreground'>
                      {t("features.themes.inSeason")}{" "}
                    </span>
                  ) : null}
                  {t(`features.themes.seasons.${id}.window`)}
                </p>
                <p className='mt-1 text-[15px] text-foreground-soft leading-relaxed'>
                  {t(`features.themes.seasons.${id}.description`)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
