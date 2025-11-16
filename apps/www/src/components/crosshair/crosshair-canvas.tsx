import {
  BACKGROUND_PATHS,
  type BackgroundKey,
} from "@deadlock-mods/crosshair/backgrounds";
import { CANVAS_CONSTANTS } from "@deadlock-mods/crosshair/constants";
import { renderCrosshair } from "@deadlock-mods/crosshair/renderer";
import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { useCallback, useEffect, useRef, useState } from "react";

export interface CrosshairCanvasProps {
  config: CrosshairConfig;
  interactive?: boolean;
  width?: number;
  height?: number;
  className?: string;
  background?: NonNullable<BackgroundKey>;
}

export function CrosshairCanvas({
  config,
  interactive = true,
  width,
  height,
  className,
  background,
}: CrosshairCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [backgroundImage, setBackgroundImage] =
    useState<HTMLImageElement | null>(null);

  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const containerWidth = container.offsetWidth;
    const containerHeight = containerWidth / CANVAS_CONSTANTS.ASPECT_RATIO;

    container.style.height = `${containerHeight}px`;

    canvas.width = containerWidth * window.devicePixelRatio;
    canvas.height = containerHeight * window.devicePixelRatio;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
  }, []);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [updateCanvasSize]);

  useEffect(() => {
    if (!background) {
      setBackgroundImage(null);
      return;
    }

    const img = new Image();
    img.src = BACKGROUND_PATHS[background];
    img.onload = () => {
      setBackgroundImage(img);
    };
    img.onerror = () => {
      setBackgroundImage(null);
    };
  }, [background]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    renderCrosshair(
      ctx,
      canvas,
      config,
      mousePos?.x,
      mousePos?.y,
      backgroundImage ?? undefined,
    );
  }, [config, mousePos, backgroundImage]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!interactive) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (canvas.height / rect.height);
      setMousePos({ x, y });
    },
    [interactive],
  );

  const handleMouseLeave = useCallback(() => {
    if (!interactive) return;
    setMousePos(null);
  }, [interactive]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: width ?? "100%" }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className='w-full h-full'
      />
    </div>
  );
}
