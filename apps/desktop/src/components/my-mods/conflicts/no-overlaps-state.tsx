import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Check, CircleCheck } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { LocalMod } from "@/types/mods";
import { ModCover } from "./mod-cover";

const MAX_TILES = 5;
const STACK_STEP = 58;
const STACK_TILT = [-7, 4, -3, 6, -5];

export const NoOverlapsState = ({ mods }: { mods: LocalMod[] }) => {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const [spread, setSpread] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setSpread(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  const shown = mods.slice(0, MAX_TILES);
  const extra = mods.length - shown.length;
  const center = (shown.length - 1) / 2;

  return (
    <Empty className='py-12'>
      <EmptyHeader>
        <EmptyMedia variant='default'>
          {shown.length === 0 ? (
            <CircleCheck className='h-12 w-12' />
          ) : (
            <div
              aria-hidden
              className='relative flex items-center gap-2'
              data-testid='no-overlaps-tiles'>
              {shown.map((mod, index) => {
                const offset = (center - index) * STACK_STEP;
                return (
                  <ModCover
                    className='h-10 w-16 rounded-md shadow-[0_4px_12px_-4px_rgb(0_0_0/0.6)] ring-1 ring-white/10 transition-transform duration-700 ease-[var(--ease-dmm-smooth)]'
                    key={mod.remoteId}
                    mod={mod}
                    style={{
                      transform: spread
                        ? "none"
                        : `translateX(${offset}px) rotate(${STACK_TILT[index]}deg)`,
                      transitionDelay: `${index * 45}ms`,
                      zIndex:
                        shown.length - Math.abs(Math.round(center - index)),
                    }}
                  />
                );
              })}
              {extra > 0 && (
                <span className='absolute left-full ml-2 text-muted-foreground text-xs tabular-nums'>
                  +{extra}
                </span>
              )}
              <span
                className={cn(
                  "absolute -bottom-2.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background transition-[opacity,scale] delay-500 duration-300 ease-[var(--ease-dmm-smooth)]",
                  spread ? "scale-100 opacity-100" : "scale-50 opacity-0",
                )}
                style={{ zIndex: MAX_TILES + 1 }}>
                <Check className='h-3 w-3' strokeWidth={3} />
              </span>
            </div>
          )}
        </EmptyMedia>
        <EmptyTitle>{t("conflicts.noneTitle")}</EmptyTitle>
        <EmptyDescription>{t("conflicts.noneDescription")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
};
