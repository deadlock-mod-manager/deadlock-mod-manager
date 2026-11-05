import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckIcon,
  CropIcon,
  ArrowClockwiseIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { modelPaintFrameAt } from "@/lib/model-paint-animation";
import { writeImagePreviewFrame } from "@/lib/model-image-surface-preview";
import {
  dragImagePlacement,
  createImagePlacementUpdates,
  type ImagePlacementHandle,
  type ModelImageAlignment,
} from "@/lib/model-image-placement";
import type { ModelImageProjectionFrame } from "@/lib/model-image-projection";

interface Props {
  frames: readonly ModelImageProjectionFrame[];
  plays: number;
  alignment: ModelImageAlignment;
  disabled: boolean;
  onChange: (alignment: ModelImageAlignment) => void;
  onApply: () => void;
  onCancel: () => void;
}
interface Drag {
  pointerId: number;
  handle: ImagePlacementHandle;
  x: number;
  y: number;
  alignment: ModelImageAlignment;
}
const corners: ImagePlacementHandle[] = ["nw", "ne", "sw", "se"];

export function ModelImagePlacement({
  frames,
  plays,
  alignment,
  disabled,
  onChange,
  onApply,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [cropping, setCropping] = useState(false);
  const updates = useMemo(
    () => createImagePlacementUpdates(onChange),
    [onChange],
  );
  useEffect(() => () => updates.cancel(), [updates]);
  const image = frames[0];
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!cropping || !context || !element || !frames[0]) return;
    const started = performance.now();
    let handle = 0;
    let previous = -1;
    let buffer: Uint8Array | undefined;
    const draw = (now: number) => {
      const index = modelPaintFrameAt(
        { frames, plays },
        (now - started) / 1000,
      );
      const frame = frames[index];
      if (frame && index !== previous) {
        const pixels = writeImagePreviewFrame(frame, buffer);
        buffer = pixels.data;
        if (
          element.width !== pixels.width ||
          element.height !== pixels.height
        ) {
          element.width = pixels.width;
          element.height = pixels.height;
        }
        context.putImageData(
          new ImageData(
            new Uint8ClampedArray(pixels.data),
            pixels.width,
            pixels.height,
          ),
          0,
          0,
        );
        previous = index;
      }
      if (frames.length > 1) handle = requestAnimationFrame(draw);
    };
    draw(started);
    return () => cancelAnimationFrame(handle);
  }, [cropping, frames, plays]);
  if (!image) return null;
  const start = (
    event: PointerEvent<HTMLElement>,
    handle: ImagePlacementHandle,
  ) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      handle,
      x: event.clientX,
      y: event.clientY,
      alignment,
    };
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    const bounds = root.current?.getBoundingClientRect();
    if (
      !current ||
      current.pointerId !== event.pointerId ||
      !bounds ||
      disabled
    )
      return;
    event.stopPropagation();
    if (current.handle === "rotate") {
      const cx = bounds.left + current.alignment.center[0] * bounds.width;
      const cy = bounds.top + current.alignment.center[1] * bounds.height;
      let rotation =
        current.alignment.rotation +
        Math.atan2(event.clientY - cy, event.clientX - cx) -
        Math.atan2(current.y - cy, current.x - cx);
      if (event.shiftKey)
        rotation = Math.round(rotation / (Math.PI / 12)) * (Math.PI / 12);
      updates.queue({
        ...current.alignment,
        rotation: Math.atan2(Math.sin(rotation), Math.cos(rotation)),
      });
    } else
      updates.queue(
        dragImagePlacement(
          current.alignment,
          current.handle,
          { x: event.clientX - current.x, y: event.clientY - current.y },
          bounds,
          image,
          cropping,
        ),
      );
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    updates.flush();
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelDrag = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    updates.cancel();
    end(event);
    if (current) onChange(current.alignment);
  };
  return (
    <div
      ref={root}
      data-image-placement
      className='pointer-events-none absolute inset-0 z-20 overflow-hidden'>
      <div className='pointer-events-auto absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-1 rounded-md border bg-popover p-1 shadow-sm'>
        <span className='px-2 text-xs text-muted-foreground'>
          {t("modelEditor.paint.surfacePreview")}
        </span>
        <Button
          size='sm'
          variant={cropping ? "secondary" : "ghost"}
          aria-pressed={cropping}
          aria-label={t("modelEditor.paint.cropImage")}
          disabled={disabled}
          onClick={() => setCropping(!cropping)}>
          <CropIcon />
          {t("modelEditor.paint.cropImage")}
        </Button>
        <Button size='sm' disabled={disabled} onClick={onApply}>
          <CheckIcon />
          {t("modelEditor.paint.applyProjection")}
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className='size-8'
          disabled={disabled}
          aria-label={t("modelEditor.paint.cancelPlacement")}
          title={t("modelEditor.paint.cancelPlacement")}
          onClick={onCancel}>
          <XIcon />
        </Button>
      </div>
      <div
        role='group'
        aria-label={t("modelEditor.paint.moveImage")}
        tabIndex={0}
        className='pointer-events-auto absolute touch-none cursor-move border border-primary outline-none focus-visible:ring-2 focus-visible:ring-ring'
        style={{
          left: `${alignment.center[0] * 100}%`,
          top: `${alignment.center[1] * 100}%`,
          width: `${alignment.scale * 100}%`,
          aspectRatio: `${image.width} / ${image.height}`,
          transform: `translate(-50%, -50%) rotate(${alignment.rotation}rad)`,
        }}
        onPointerDown={(event) => start(event, "move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Escape") {
            event.stopPropagation();
            event.preventDefault();
            updates.cancel();
            onCancel();
            return;
          }
          if (event.target !== event.currentTarget) return;
          const step = event.shiftKey ? 0.025 : 0.005;
          let next: ModelImageAlignment | null = null;
          if (event.key === "ArrowLeft")
            next = {
              ...alignment,
              center: [
                Math.max(0, alignment.center[0] - step),
                alignment.center[1],
              ],
            };
          if (event.key === "ArrowRight")
            next = {
              ...alignment,
              center: [
                Math.min(1, alignment.center[0] + step),
                alignment.center[1],
              ],
            };
          if (event.key === "ArrowUp")
            next = {
              ...alignment,
              center: [
                alignment.center[0],
                Math.max(0, alignment.center[1] - step),
              ],
            };
          if (event.key === "ArrowDown")
            next = {
              ...alignment,
              center: [
                alignment.center[0],
                Math.min(1, alignment.center[1] + step),
              ],
            };
          if (next) {
            event.stopPropagation();
            event.preventDefault();
            onChange(next);
          }
        }}>
        {cropping ? (
          <canvas
            ref={canvas}
            aria-label={t("modelEditor.paint.imageDraftCanvas")}
            className='pointer-events-none block size-full'
            style={{
              clipPath: cropping
                ? undefined
                : `inset(${alignment.crop.top * 100}% ${(1 - alignment.crop.right) * 100}% ${(1 - alignment.crop.bottom) * 100}% ${alignment.crop.left * 100}%)`,
              opacity: cropping ? 0.65 : 1,
            }}
          />
        ) : null}
        {cropping ? (
          <div
            className='pointer-events-none absolute border-2 border-primary'
            style={{
              left: `${alignment.crop.left * 100}%`,
              top: `${alignment.crop.top * 100}%`,
              width: `${(alignment.crop.right - alignment.crop.left) * 100}%`,
              height: `${(alignment.crop.bottom - alignment.crop.top) * 100}%`,
            }}
          />
        ) : null}
        {corners.map((corner) => (
          <button
            type='button'
            key={corner}
            disabled={disabled}
            aria-label={t(
              cropping
                ? "modelEditor.paint.cropCorner"
                : "modelEditor.paint.resizeCorner",
              { corner },
            )}
            className='absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-primary bg-popover focus-visible:ring-2 focus-visible:ring-ring'
            style={{
              left: `${100 * (corner.includes("w") ? (cropping ? alignment.crop.left : 0) : cropping ? alignment.crop.right : 1)}%`,
              top: `${100 * (corner.includes("n") ? (cropping ? alignment.crop.top : 0) : cropping ? alignment.crop.bottom : 1)}%`,
              cursor:
                corner === "nw" || corner === "se"
                  ? "nwse-resize"
                  : "nesw-resize",
            }}
            onKeyDown={(event) => {
              if (!event.key.startsWith("Arrow") || disabled) return;
              const bounds = root.current?.getBoundingClientRect();
              if (!bounds) return;
              event.preventDefault();
              event.stopPropagation();
              const step = event.shiftKey ? 10 : 1;
              onChange(
                dragImagePlacement(
                  alignment,
                  corner,
                  {
                    x:
                      event.key === "ArrowLeft"
                        ? -step
                        : event.key === "ArrowRight"
                          ? step
                          : 0,
                    y:
                      event.key === "ArrowUp"
                        ? -step
                        : event.key === "ArrowDown"
                          ? step
                          : 0,
                  },
                  bounds,
                  image,
                  cropping,
                ),
              );
            }}
            onPointerDown={(event) => start(event, corner)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          />
        ))}
        {!cropping ? (
          <button
            type='button'
            disabled={disabled}
            aria-label={t("modelEditor.paint.rotateImage")}
            title={t("modelEditor.paint.rotateImage")}
            className='absolute -top-8 left-1/2 flex size-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-primary bg-popover text-primary'
            onKeyDown={(event) => {
              if (
                disabled ||
                (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              const rotation =
                alignment.rotation +
                (((event.key === "ArrowLeft" ? -1 : 1) * Math.PI) / 180) *
                  (event.shiftKey ? 15 : 1);
              onChange({
                ...alignment,
                rotation: Math.atan2(Math.sin(rotation), Math.cos(rotation)),
              });
            }}
            onPointerDown={(event) => start(event, "rotate")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={() => {
              drag.current = null;
            }}>
            <ArrowClockwiseIcon className='size-4' />
          </button>
        ) : null}
      </div>
      <p className='absolute top-14 left-3 max-w-[calc(100%-7rem)] rounded bg-popover px-2 py-1 text-[11px] text-muted-foreground'>
        {t(
          cropping
            ? "modelEditor.paint.cropHint"
            : "modelEditor.paint.placementHint",
        )}
      </p>
    </div>
  );
}
