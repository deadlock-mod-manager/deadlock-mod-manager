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

interface FoundryPatternPickerProps {
  value: FoundryPatternId;
  onChange: (pattern: FoundryPatternId) => void;
  disabled?: boolean;
}

/** A grid of pattern swatches, with "none" for a plain recolor. */
export const FoundryPatternPicker = ({
  value,
  onChange,
  disabled,
}: FoundryPatternPickerProps) => {
  const { t } = useTranslation();
  const swatches = useSwatches();

  const tile = (pattern: FoundryPatternId, children: React.ReactNode) => (
    <button
      className={cn(
        "group relative aspect-square overflow-hidden rounded transition-colors",
        "border",
        value === pattern
          ? "border-primary ring-1 ring-primary"
          : "border-border/60 hover:border-primary/60",
        disabled && "pointer-events-none opacity-50",
      )}
      disabled={disabled}
      key={pattern}
      onClick={() => onChange(pattern)}
      title={t(`foundry.paint.patterns.${pattern}`)}
      type='button'>
      {children}
      <span className='absolute inset-x-0 bottom-0 truncate bg-background/85 px-0.5 text-[8px] leading-[1.35] text-muted-foreground'>
        {t(`foundry.paint.patterns.${pattern}`)}
      </span>
    </button>
  );

  return (
    <div className='grid grid-cols-6 gap-1'>
      {tile(
        "none",
        <div className='flex h-full w-full items-center justify-center bg-muted/40'>
          <ProhibitIcon className='h-4 w-4 text-muted-foreground' />
        </div>,
      )}
      {PATTERNS.map((pattern) => {
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
            <div className='h-full w-full animate-pulse bg-muted/60' />
          ),
        );
      })}
    </div>
  );
};
