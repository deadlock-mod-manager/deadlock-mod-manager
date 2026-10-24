import { Kbd } from "@deadlock-mods/ui/components/kbd";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CaretDownIcon, CaretUpIcon, type Icon } from "@phosphor-icons/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { AbilitySlot } from "@/lib/preview-actions";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";
import { overlaySurface } from "./viewer-tools";

const EASE_OUT_QUART = "cubic-bezier(0.25, 1, 0.5, 1)";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

/** Typing in the search box or picking a speed must not fire an ability. */
const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

const isPlainKey = (event: KeyboardEvent) =>
  !event.repeat &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !isTypingTarget(event.target);

/** Runs `callback` every frame, for readouts that follow the render loop without re-rendering React. */
const useAnimationFrame = (callback: () => void) => {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  }, [callback]);
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      latest.current();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, []);
};

/** Where the clock sits inside the looping animation, in seconds. */
const loopTime = (animation: PreviewAnimation | null, time: number) =>
  animation && animation.duration > 0 ? time % animation.duration : 0;

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;

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

/**
 * A scrubber over the looping animation. It follows the render clock through a
 * ref every frame, and its ticks mark where one clip of a combined move ends and
 * the next begins.
 */
export const Timeline = ({
  animation,
  timeRef,
  onSeek,
  className,
}: {
  animation: PreviewAnimation | null;
  timeRef: RefObject<number>;
  onSeek: (time: number) => void;
  className?: string;
}) => {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef<number | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const duration = animation?.duration ?? 0;

  useAnimationFrame(() => {
    if (pendingSeek.current !== null) {
      onSeek(pendingSeek.current);
      pendingSeek.current = null;
    }
    const time = dragging.current ?? loopTime(animation, timeRef.current);
    const progress = duration > 0 ? time / duration : 0;
    if (fillRef.current)
      fillRef.current.style.transform = `scaleX(${progress})`;
    if (headRef.current) headRef.current.style.left = `${progress * 100}%`;
    if (currentRef.current) currentRef.current.textContent = formatTime(time);
    trackRef.current?.setAttribute("aria-valuenow", time.toFixed(2));
  });

  const timeAt = (event: ReactPointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1,
    );
    return ratio * duration;
  };
  const scrubTo = (time: number) => {
    dragging.current = time;
    pendingSeek.current = time;
  };
  const onKeyDown = (event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? 1 : 0.1;
    const now = loopTime(animation, timeRef.current);
    const next =
      event.key === "ArrowRight"
        ? Math.min(now + step, duration)
        : event.key === "ArrowLeft"
          ? Math.max(now - step, 0)
          : event.key === "Home"
            ? 0
            : null;
    if (next === null) return;
    event.preventDefault();
    onSeek(next);
  };

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        !duration && "opacity-50",
        className,
      )}>
      <span
        ref={currentRef}
        className='w-14 shrink-0 font-mono text-[11px] text-foreground tabular-nums'>
        {formatTime(0)}
      </span>
      <div
        ref={trackRef}
        role='slider'
        tabIndex={duration ? 0 : -1}
        aria-label={t("modelPreview.timeline")}
        aria-valuemin={0}
        aria-valuemax={Number(duration.toFixed(2))}
        aria-disabled={!duration}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (!duration) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          scrubTo(timeAt(event));
        }}
        onPointerMove={(event) => {
          if (dragging.current !== null) scrubTo(timeAt(event));
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
        className='group relative flex h-5 min-w-0 flex-1 cursor-pointer touch-none items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default'>
        <div className='relative h-1 w-full overflow-hidden rounded-full bg-muted transition-[height] duration-150 group-hover:h-1.5'>
          <div
            ref={fillRef}
            className='absolute inset-0 origin-left scale-x-0 bg-primary'
          />
        </div>
        {(animation?.segments ?? []).slice(1).map((segment) => (
          <span
            key={`${segment.clipPath}:${segment.start}`}
            aria-hidden
            className='pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/35'
            style={{ left: `${(segment.start / duration) * 100}%` }}
          />
        ))}
        <div
          ref={headRef}
          aria-hidden
          className='pointer-events-none absolute top-1/2 left-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-foreground opacity-0 shadow-black/50 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100'
        />
      </div>
      <span className='w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums'>
        {formatTime(duration)}
      </span>
    </div>
  );
};

export const EffectToggle = ({
  on,
  onChange,
  icon: ToggleIcon,
  children,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  icon: Icon;
  children: ReactNode;
}) => (
  <button
    type='button'
    aria-pressed={on}
    onClick={() => onChange(!on)}
    className={cn(
      "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      on
        ? "border-primary/40 bg-primary/10 text-primary"
        : "bg-background text-muted-foreground hover:text-foreground",
    )}>
    <ToggleIcon className='size-3.5' weight={on ? "fill" : "regular"} />
    {children}
  </button>
);

export const SpeedPicker = ({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (speed: number) => void;
}) => {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      type='single'
      size='sm'
      aria-label={t("modelPreview.speed")}
      value={String(speed)}
      onValueChange={(value) => value && onChange(Number(value))}
      className='gap-0.5 rounded-md bg-muted/60 p-0.5'>
      {SPEEDS.map((value) => (
        <ToggleGroupItem
          key={value}
          value={String(value)}
          className='h-7 min-w-0 px-1.5 font-mono text-[11px] text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground'>
          {value}×
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};
