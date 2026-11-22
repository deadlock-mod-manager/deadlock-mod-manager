import { cn } from "@deadlock-mods/ui/lib/utils";
import { ProhibitIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { foundryPatternSwatch } from "@/lib/foundry";
import logger from "@/lib/logger";
import { FOUNDRY_PATTERNS, type FoundryPatternId } from "@/types/foundry";

type PatternName = Exclude<FoundryPatternId, "none">;

const PATTERNS = FOUNDRY_PATTERNS.filter(
  (pattern): pattern is PatternName => pattern !== "none",
);

/**
 * Swatches are pure pattern generation with no VPK read, so they are the same
 * for every skin and every session. Caching them module-wide means the picker
 * paints instantly after the first open.
 */
const swatchCache = new Map<PatternName, string>();

const useSwatches = (): Map<PatternName, string> => {
  const [swatches, setSwatches] = useState(() => new Map(swatchCache));

  useEffect(() => {
    let cancelled = false;
    const missing = PATTERNS.filter((pattern) => !swatchCache.has(pattern));
    if (missing.length === 0) return;

    Promise.all(
      missing.map(async (pattern) => {
        try {
          swatchCache.set(pattern, await foundryPatternSwatch(pattern, 0, 64));
        } catch (err) {
          // A missing swatch only costs the tile its preview.
          logger.withError(err).warn("[Foundry] Pattern swatch failed");
        }
      }),
    ).then(() => {
      if (!cancelled) setSwatches(new Map(swatchCache));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return swatches;
};

/** The patterns shown before the grid is expanded, after "none". */
const FEATURED: PatternName[] = ["camo", "carbon", "holo", "lava", "galaxy"];

interface FoundryPatternPickerProps {
  value: FoundryPatternId;
  onChange: (pattern: FoundryPatternId) => void;
  /** Every pattern, or "none" and a featured few plus the selected one. */
  expanded: boolean;
  disabled?: boolean;
}

/** A grid of pattern swatches, with "none" for a plain recolor. */
export const FoundryPatternPicker = ({
  value,
  onChange,
  expanded,
  disabled,
}: FoundryPatternPickerProps) => {
  const { t } = useTranslation();
  const swatches = useSwatches();
  const picked = value === "none" ? null : value;
  const shown = expanded
    ? PATTERNS
    : picked === null || FEATURED.includes(picked)
      ? FEATURED
      : [...FEATURED.slice(0, 4), picked];

  const tile = (pattern: FoundryPatternId, preview: React.ReactNode) => {
    const selected = value === pattern;
    return (
      <button
        aria-pressed={selected}
        className={cn(
          "flex min-w-0 flex-col gap-[5px] text-left",
          disabled && "pointer-events-none opacity-50",
        )}
        disabled={disabled}
        key={pattern}
        onClick={() => onChange(pattern)}
        type='button'>
        <span
          className={cn(
            "flex h-11 w-full items-center justify-center overflow-hidden rounded-md border bg-background transition-colors",
            selected
              ? "border-2 border-primary"
              : "hover:border-muted-foreground/60",
          )}>
          {preview}
        </span>
        <span
          className={cn(
            "truncate text-[11px]",
            selected ? "font-semibold" : "text-muted-foreground",
          )}>
          {t(`foundry.paint.patterns.${pattern}`)}
        </span>
      </button>
    );
  };

  return (
    <div className='grid grid-cols-3 gap-x-2 gap-y-2.5'>
      {tile("none", <ProhibitIcon className='h-4 w-4 text-muted-foreground' />)}
      {shown.map((pattern) => {
        const swatch = swatches.get(pattern);
        return tile(
          pattern,
          swatch ? (
            <img
              alt=''
              className='h-full w-full object-cover'
              decoding='async'
              src={swatch}
            />
          ) : (
            <span className='h-full w-full animate-pulse bg-muted/60' />
          ),
        );
      })}
    </div>
  );
};
