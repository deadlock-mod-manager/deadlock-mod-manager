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
import { EASE_OUT_QUART, isPlainKey, loopTime } from "./viewer-transport-utils";
import { useAnimationFrame } from "./use-viewer-animation-frame";

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
    <div className='relative flex min-h-11 shrink-0 items-center border-t bg-card px-3 py-1'>
      <div
        inert={hidden}
        className={cn("flex min-w-0 items-center gap-3", hidden && "hidden")}>
        <p
          aria-live='polite'
          className='order-2 truncate text-[11px] text-muted-foreground'>
          {active?.ability.name ?? t("modelPreview.abilities")}
        </p>
        <div
          role='group'
          aria-label={t("modelPreview.abilities")}
          className='flex items-center gap-1'>
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
                      "relative flex size-8 items-center justify-center rounded-lg border transition-[background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35",
                      isActive
                        ? "border-primary/50 bg-primary"
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
                          "relative size-5 object-contain",
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
                className='flex h-8 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
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
          "flex h-7 items-center gap-1.5 rounded px-2 text-[11px] text-muted-foreground hover:text-foreground",
          !hidden && "hidden",
        )}>
        <CaretUpIcon className='size-3' />
        {t("modelPreview.showAbilities")}
        <Kbd className='h-4 px-1'>H</Kbd>
      </button>
    </div>
  );
};
