import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";
import { useAnimationFrame } from "./use-viewer-animation-frame";
import { loopTime, formatTime } from "./viewer-transport-utils";

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
        "flex min-w-0 items-center gap-2",
        !duration && "opacity-50",
        className,
      )}>
      <span
        ref={currentRef}
        className='w-12 shrink-0 font-mono text-[11px] text-foreground tabular-nums'>
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
      <span className='w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums'>
        {formatTime(duration)}
      </span>
    </div>
  );
};
