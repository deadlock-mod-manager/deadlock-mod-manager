import { useEffect, useRef, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingPaintStroke } from "@/types/generated/ModdingPaintStroke";
import { opaquePaintPreview } from "./model-paint-preview";

const point = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
  const rect = e.currentTarget.getBoundingClientRect();
  return [
    Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  ];
};

export function ModelPaintCanvas({
  pixels,
  width = 256,
  height = 256,
  brush,
  disabled,
  maxPoints,
  onStroke,
}: {
  pixels: Uint8Array | undefined;
  width?: number;
  height?: number;
  brush: Omit<ModdingPaintStroke, "points">;
  disabled: boolean;
  maxPoints: number;
  onStroke: (stroke: ModdingPaintStroke) => void;
}) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<ModdingPaintStroke | null>(null);
  useEffect(() => {
    if (!pixels || !canvas.current) return;
    const context = canvas.current.getContext("2d");
    context?.putImageData(
      new ImageData(opaquePaintPreview(pixels), width, height),
      0,
      0,
    );
  }, [pixels, width, height]);
  return (
    <canvas
      ref={canvas}
      tabIndex={0}
      width={width}
      height={height}
      style={{ aspectRatio: `${width} / ${height}` }}
      aria-label={t("modelEditor.paint.canvas")}
      className='w-full touch-none rounded border bg-muted cursor-crosshair'
      onPointerDown={(e) => {
        if (disabled || !pixels || e.button !== 0) return;
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = { ...brush, points: [point(e)] };
      }}
      onPointerMove={(e) => {
        const stroke = active.current;
        if (
          !stroke ||
          stroke.fillTolerance != null ||
          stroke.points.length >= maxPoints
        )
          return;
        const next = point(e),
          previous = stroke.points.at(-1);
        if (
          !previous ||
          Math.hypot(next[0] - previous[0], next[1] - previous[1]) < 0.002
        )
          return;
        stroke.points.push(next);
        const context = e.currentTarget.getContext("2d");
        if (!context) return;
        context.save();
        context.scale(width, height);
        context.strokeStyle = stroke.erase
          ? "#888888"
          : `rgb(${stroke.color.join(",")})`;
        context.globalAlpha = 0.5;
        context.lineWidth = stroke.radius * 2;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(previous[0], previous[1]);
        context.lineTo(next[0], next[1]);
        context.stroke();
        context.restore();
      }}
      onPointerUp={(e) => {
        const stroke = active.current;
        active.current = null;
        if (stroke) onStroke(stroke);
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        active.current = null;
        if (pixels)
          canvas.current
            ?.getContext("2d")
            ?.putImageData(
              new ImageData(opaquePaintPreview(pixels), width, height),
              0,
              0,
            );
      }}
    />
  );
}
