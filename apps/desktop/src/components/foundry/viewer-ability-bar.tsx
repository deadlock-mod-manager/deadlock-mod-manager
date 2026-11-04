import { Kbd } from "@deadlock-mods/ui/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { type RefObject, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { AbilitySlot } from "@/lib/preview-actions";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";
import { overlaySurface } from "./viewer-tools";
import { EASE_OUT_QUART, isPlainKey, loopTime } from "./viewer-transport-utils";
import { useAnimationFrame } from "./use-viewer-animation-frame";

/**
 * The hero's four abilities along the bottom of the viewport, like the in-game
 * HUD. The number keys cast them, as they would in a match; the playing one
 * drains a cooldown sweep as its animation runs. H tucks the bar away.
 */
export const AbilityBar = ({
  slots,
  activeId,
  onSelect,
  hidden,
  onHiddenChange,
  animation,
  timeRef,
}: {
  slots: AbilitySlot[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
  animation: PreviewAnimation | null;
  timeRef: RefObject<number>;
}) => {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const ringRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const sweepRef = useRef<HTMLSpanElement>(null);
  const activeIndex = slots.findIndex(
    (slot) => slot.action !== null && slot.action.id === activeId,
  );
  const active = slots[activeIndex];

  const cast = (index: number) => {
    const action = slots[index]?.action;
    if (!action) return;
    onSelect(action.id);
    if (reducedMotion) return;
    slotRefs.current[index]?.animate(
      [{ transform: "scale(0.88)" }, { transform: "scale(1)" }],
      { duration: 260, easing: EASE_OUT_QUART },
    );
    ringRefs.current[index]?.animate(
      [
        { opacity: 0.8, transform: "scale(1)" },
        { opacity: 0, transform: "scale(1.45)" },
      ],
      { duration: 480, easing: EASE_OUT_QUART },
    );
  };
  const castRef = useRef(cast);
  useEffect(() => {
    castRef.current = cast;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPlainKey(event)) return;
      if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        onHiddenChange(!hidden);
        return;
      }
      const index = Number(event.key) - 1;
      if (!slots[index]?.action) return;
      event.preventDefault();
      castRef.current(index);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slots, hidden, onHiddenChange]);

  useAnimationFrame(() => {
    const sweep = sweepRef.current;
    if (!sweep || !animation?.duration) return;
    const progress = loopTime(animation, timeRef.current) / animation.duration;
    sweep.style.background = `conic-gradient(transparent ${progress}turn, oklch(0.2 0.01 60 / 0.55) 0)`;
  });

  return (
    <div className='pointer-events-none absolute inset-x-0 bottom-4 flex justify-center'>
      <div
        inert={hidden}
        className={cn(
          "flex flex-col items-center gap-2 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
          hidden && "translate-y-6 opacity-0",
        )}>
        <p
          aria-live='polite'
          className='h-4 font-medium text-[11px] text-primary drop-shadow-[0_1px_2px_rgb(0_0_0/0.8)]'>
          {active?.ability.name}
        </p>
        <div
          role='group'
          aria-label={t("modelPreview.abilities")}
          className={cn(
            overlaySurface,
            "pointer-events-auto flex items-center gap-1.5 rounded-xl p-1.5",
          )}>
          {slots.map(({ ability, action }, index) => {
            const isActive = index === activeIndex;
            return (
              <Tooltip key={ability.className}>
                <TooltipTrigger asChild>
                  <button
                    ref={(node) => {
                      slotRefs.current[index] = node;
                    }}
                    type='button'
                    aria-pressed={isActive}
                    aria-label={ability.name}
                    aria-keyshortcuts={String(index + 1)}
                    disabled={!action}
                    onClick={() => cast(index)}
                    className={cn(
                      "relative flex size-11 items-center justify-center rounded-lg border transition-[background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35",
                      isActive
                        ? "border-primary bg-primary shadow-[0_0_20px_2px] shadow-primary/35"
                        : "border-white/10 bg-secondary enabled:hover:border-primary/50 enabled:hover:bg-secondary/70",
                    )}>
                    <span
                      ref={(node) => {
                        ringRefs.current[index] = node;
                      }}
                      aria-hidden
                      className='pointer-events-none absolute -inset-px rounded-lg border-2 border-primary opacity-0'
                    />
                    {isActive && (
                      <span
                        ref={sweepRef}
                        aria-hidden
                        className='pointer-events-none absolute inset-0 rounded-[inherit]'
                      />
                    )}
                    {ability.image ? (
                      <img
                        src={ability.image}
                        alt=''
                        draggable={false}
                        className={cn(
                          "relative size-7 object-contain",
                          isActive ? "opacity-85 brightness-0" : "opacity-90",
                        )}
                      />
                    ) : (
                      <span
                        className={cn(
                          "relative font-semibold text-sm",
                          isActive
                            ? "text-primary-foreground"
                            : "text-foreground",
                        )}>
                        {ability.name.charAt(0)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "absolute right-0.5 bottom-0.5 rounded px-1 font-mono font-semibold text-[9px] leading-[14px]",
                        isActive
                          ? "bg-primary-foreground text-primary"
                          : "bg-background/90 text-muted-foreground",
                      )}>
                      {index + 1}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side='top'>
                  {action
                    ? ability.name
                    : t("modelPreview.noAbilityAnimation", {
                        ability: ability.name,
                      })}
                </TooltipContent>
              </Tooltip>
            );
          })}
          <div className='mx-0.5 h-7 w-px bg-white/10' />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                aria-label={t("modelPreview.hideAbilities")}
                aria-keyshortcuts='H'
                onClick={() => onHiddenChange(true)}
                className='flex h-11 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
                <CaretDownIcon className='size-3.5' />
              </button>
            </TooltipTrigger>
            <TooltipContent side='top'>
              {t("modelPreview.hideAbilities")} <Kbd className='ml-1'>H</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <button
        type='button'
        inert={!hidden}
        aria-keyshortcuts='H'
        onClick={() => onHiddenChange(false)}
        className={cn(
          overlaySurface,
          "pointer-events-auto absolute bottom-0 flex h-7 items-center gap-1.5 rounded-full pr-1.5 pl-2.5 text-[11px] text-muted-foreground transition-[transform,opacity,color] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] hover:text-foreground",
          !hidden && "pointer-events-none translate-y-3 opacity-0",
        )}>
        <CaretUpIcon className='size-3' />
        {t("modelPreview.showAbilities")}
        <Kbd className='h-4 px-1'>H</Kbd>
      </button>
    </div>
  );
};
