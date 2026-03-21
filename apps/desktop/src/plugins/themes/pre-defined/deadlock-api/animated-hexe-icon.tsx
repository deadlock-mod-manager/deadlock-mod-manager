import { useEffect, useRef } from "react";

interface AnimatedHexeIconProps {
  className?: string;
  size?: number;
}

export function AnimatedHexeIcon({
  className,
  size = 44,
}: AnimatedHexeIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    let animationId: number;
    let time = 0;

    const drawHexagon = (
      cx: number,
      cy: number,
      radius: number,
      rotation: number,
      alpha: number,
      lineWidth: number,
    ) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + rotation;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(250, 68, 84, ${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;

      const flicker = 0.7 + 0.3 * Math.sin(time * 3) * Math.sin(time * 7);
      const pulse = 1 + 0.05 * Math.sin(time * 2);

      const glowRadius = 20 * pulse;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      gradient.addColorStop(0, `rgba(250, 68, 84, ${0.4 * flicker})`);
      gradient.addColorStop(0.5, `rgba(250, 68, 84, ${0.15 * flicker})`);
      gradient.addColorStop(1, "rgba(250, 68, 84, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      const baseRotation = -Math.PI / 2;
      const wobble = 0.02 * Math.sin(time * 1.5);

      drawHexagon(cx, cy, 18 * pulse, baseRotation + wobble, 0.3 * flicker, 1);
      drawHexagon(
        cx,
        cy,
        14 * pulse,
        baseRotation - wobble,
        0.6 * flicker,
        1.5,
      );
      drawHexagon(
        cx,
        cy,
        8 * pulse,
        baseRotation + wobble * 2,
        0.9 * flicker,
        2,
      );

      ctx.beginPath();
      ctx.arc(cx, cy, 3 * pulse, 0, Math.PI * 2);
      const coreGradient = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        3 * pulse,
      );
      coreGradient.addColorStop(0, `rgba(255, 255, 255, ${0.9 * flicker})`);
      coreGradient.addColorStop(0.5, `rgba(250, 68, 84, ${0.8 * flicker})`);
      coreGradient.addColorStop(1, `rgba(250, 68, 84, ${0.4 * flicker})`);
      ctx.fillStyle = coreGradient;
      ctx.fill();

      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + baseRotation;
        const innerRadius = 8 * pulse;
        const outerRadius = 18 * pulse;
        const x1 = cx + innerRadius * Math.cos(angle);
        const y1 = cy + innerRadius * Math.sin(angle);
        const x2 = cx + outerRadius * Math.cos(angle);
        const y2 = cy + outerRadius * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(250, 68, 84, ${0.3 * flicker})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      time += 0.016;
    };

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      draw();
      return;
    }

    const animate = () => {
      draw();
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
