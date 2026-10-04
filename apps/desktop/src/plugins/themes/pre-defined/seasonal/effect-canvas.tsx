import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { Season } from "./season";

export type Effect = {
  resize: (width: number, height: number) => void;
  /** Advance by `dt` seconds and paint. The canvas is not cleared between frames. */
  frame: (ctx: CanvasRenderingContext2D, dt: number, time: number) => void;
  dispose?: () => void;
};

type EffectCanvasProps = {
  create: () => Effect;
  layer: Season["layer"];
  opacity?: number;
};

export const EffectCanvas = ({
  create,
  layer,
  opacity = 1,
}: EffectCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const effect = create();
    let frameId = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { innerWidth: width, innerHeight: height } = window;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      effect.resize(width, height);
    };

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      effect.frame(ctx, dt, now / 1000);
      frameId = requestAnimationFrame(loop);
    };

    const onVisibility = () => {
      cancelAnimationFrame(frameId);
      if (!document.hidden) {
        last = performance.now();
        frameId = requestAnimationFrame(loop);
      }
    };

    resize();
    frameId = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      effect.dispose?.();
    };
  }, [create, reducedMotion]);

  if (reducedMotion) return null;

  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden
      className='seasonal-effect-canvas'
      data-layer={layer}
      style={{ opacity }}
    />,
    document.body,
  );
};

export const AmbientLayer = ({ className }: { className: string }) =>
  createPortal(<div aria-hidden className={className} />, document.body);

export const random = (min: number, max: number) =>
  min + Math.random() * (max - min);

export const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)];

/** Soft round sprite; drawing it is far cheaper than a fresh radial gradient per particle. */
export const glowSprite = (rgb: string, size = 64) => {
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, `rgba(${rgb}, 1)`);
    gradient.addColorStop(0.3, `rgba(${rgb}, 0.85)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return sprite;
};
