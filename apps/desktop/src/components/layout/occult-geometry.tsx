import { useMemo } from "react";
import { useWindowFocused } from "@/hooks/use-window-focused";
import { usePersistedStore } from "@/lib/store";

const GOLDEN_RATIO = 1.618033988749;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const OCCULT_PATHS = [
  // Pentagram
  "M0,-10 L5.88,8.09 L-9.51,-3.09 L9.51,-3.09 L-5.88,8.09 Z",
  // Inverted pentagram
  "M0,10 L-5.88,-8.09 L9.51,3.09 L-9.51,3.09 L5.88,-8.09 Z",
  // Septagram
  "M0,-10 L4.34,9.01 L-7.82,-6.23 L9.75,2.23 L-9.75,2.23 L7.82,-6.23 L-4.34,9.01 Z",
  // Pentagram inscribed in circle
  "M0,-10 L5.88,8.09 L-9.51,-3.09 L9.51,-3.09 L-5.88,8.09 Z M-10,0 A10,10 0 1,1 10,0 A10,10 0 1,1 -10,0",
  // Alchemical fire triangle
  "M0,-10 L8.66,5 L-8.66,5 Z M-5,0 L5,0",
  // Alchemical water triangle
  "M0,10 L-8.66,-5 L8.66,-5 Z M-5,0 L5,0",
  // Chaos star (8 arrows)
  "M0,-10 L0,10 M-10,0 L10,0 M-7.07,-7.07 L7.07,7.07 M7.07,-7.07 L-7.07,7.07 M0,-10 L-1.5,-7 M0,-10 L1.5,-7 M0,10 L-1.5,7 M0,10 L1.5,7 M-10,0 L-7,-1.5 M-10,0 L-7,1.5 M10,0 L7,-1.5 M10,0 L7,1.5",
  // Nested diamonds with cross
  "M0,-9 L9,0 L0,9 L-9,0 Z M0,-5 L5,0 L0,5 L-5,0 Z M0,-12 L0,12 M-12,0 L12,0",
];

const ASTROLOGY_PATHS = [
  // Sun ☉ — circle with dot and 4 rays
  "M-7,0 A7,7 0 1,1 7,0 A7,7 0 1,1 -7,0 M-1,0 A1,1 0 1,1 1,0 A1,1 0 1,1 -1,0 M0,-9 L0,-7 M0,7 L0,9 M-9,0 L-7,0 M7,0 L9,0",
  // Moon crescent ☽
  "M3,-7 A7,7 0 1,0 3,7 A5,5 0 1,1 3,-7",
  // Venus ♀ — circle + cross
  "M-5,-2 A5,5 0 1,1 5,-2 A5,5 0 1,1 -5,-2 M0,3 L0,10 M-3,7 L3,7",
  // Mars ♂ — circle + arrow
  "M-4,2 A5.5,5.5 0 1,1 3,-5 M3,-5 L7,-9 M7,-9 L3,-9 M7,-9 L7,-5",
  // Saturn ♄
  "M-2,-10 L-2,1 Q-2,5 3,5 M-5,-6 L1,-6",
  // Eye of Providence
  "M-10,0 Q0,-8 10,0 Q0,6 -10,0 M-2,0 A2,2 0 1,1 2,0 A2,2 0 1,1 -2,0",
  // Triple Moon (waxing + full + waning)
  "M0,-6 A6,6 0 1,1 0,6 A6,6 0 1,1 0,-6 M-8,-5 A6,6 0 0,0 -8,5 A4,4 0 0,1 -8,-5 M8,-5 A6,6 0 0,1 8,5 A4,4 0 0,0 8,-5",
  // Mercury ☿ — circle + horns + cross
  "M-4,0 A4,4 0 1,1 4,0 A4,4 0 1,1 -4,0 M0,4 L0,10 M-3,7 L3,7 M-3,-4 A3,3 0 0,1 0,-7 A3,3 0 0,1 3,-4",
];

const MODDING_PATHS = [
  // Gear/cog
  "M-3.5,0 A3.5,3.5 0 1,1 3.5,0 A3.5,3.5 0 1,1 -3.5,0 M-1,-8 L1,-8 L1.5,-5 L-1.5,-5 Z M-1,8 L1,8 L1.5,5 L-1.5,5 Z M-8,-1 L-8,1 L-5,1.5 L-5,-1.5 Z M8,-1 L8,1 L5,1.5 L5,-1.5 Z M-5.5,-5.5 L-6.5,-6.5 L-4,-7 L-7,-4 Z M5.5,5.5 L6.5,6.5 L4,7 L7,4 Z M5.5,-5.5 L6.5,-6.5 L7,-4 L4,-7 Z M-5.5,5.5 L-6.5,6.5 L-7,4 L-4,7 Z",
  // Code brackets </>
  "M-5,-8 L-10,0 L-5,8 M5,-8 L10,0 L5,8 M-2,5 L2,-5",
  // Wrench
  "M-7,-8 Q-10,-5 -7,-2 L4,7 Q5,10 8,10 Q10,10 10,7 Q10,5 7,4 L-2,-5 Q-5,-10 -7,-8 Z M-6,-4 L-4,-6",
  // Shield
  "M0,-10 L8,-6 L8,1 Q8,7 0,10 Q-8,7 -8,1 L-8,-6 Z M0,-6 L0,6 M-4,-2 L4,-2",
  // Lightning bolt
  "M-1,-10 L-5,0 L-1,-1 L-3,10 L5,0 L1,1 L3,-10 Z",
  // Puzzle piece
  "M-7,-7 L-1,-7 Q-1,-10 2,-10 Q2,-7 2,-7 L7,-7 L7,7 L-7,7 Z",
  // Anvil
  "M-8,4 L8,4 L6,8 L-6,8 Z M-4,-4 L4,-4 L5,0 L5,4 L-5,4 L-5,0 Z M-2,-4 L-2,-8 L2,-8 L2,-4",
  // Crosshair/target reticle
  "M0,-10 L0,-4 M0,4 L0,10 M-10,0 L-4,0 M4,0 L10,0 M-3,0 A3,3 0 1,1 3,0 A3,3 0 1,1 -3,0 M-7,0 A7,7 0 1,1 7,0 A7,7 0 1,1 -7,0",
];

const ALL_SYMBOL_PATHS = [
  ...OCCULT_PATHS,
  ...ASTROLOGY_PATHS,
  ...MODDING_PATHS,
];

function ConcentricRings({
  cx,
  cy,
  baseRadius,
  ringCount,
  tickMarks = true,
  seed = 42,
}: {
  cx: number;
  cy: number;
  baseRadius: number;
  ringCount: number;
  tickMarks?: boolean;
  seed?: number;
}) {
  const rings = useMemo(() => {
    const rng = seededRandom(seed);
    const items = [];
    for (let i = 0; i < ringCount; i++) {
      const r = baseRadius + i * baseRadius * (0.3 + rng() * 0.15);
      const opacity = 0.18 - i * 0.02;
      const dashLength = 4 + rng() * 12;
      const gapLength = 2 + rng() * 8;
      items.push({
        r,
        opacity: Math.max(opacity, 0.04),
        strokeDasharray: i % 2 === 0 ? "none" : `${dashLength} ${gapLength}`,
        strokeWidth: i === 0 ? 0.8 : 0.4 + rng() * 0.3,
      });
    }
    return items;
  }, [baseRadius, ringCount, seed]);

  const ticks = useMemo(() => {
    if (!tickMarks) return [];
    const items = [];
    const tickCount = 36;
    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2;
      const isCardinal = i % 9 === 0;
      const len = isCardinal ? 8 : i % 3 === 0 ? 5 : 3;
      items.push({
        x1: cx + Math.cos(angle) * (baseRadius - len),
        y1: cy + Math.sin(angle) * (baseRadius - len),
        x2: cx + Math.cos(angle) * (baseRadius + 1),
        y2: cy + Math.sin(angle) * (baseRadius + 1),
        opacity: isCardinal ? 0.2 : 0.1,
        strokeWidth: isCardinal ? 0.7 : 0.4,
      });
    }
    return items;
  }, [cx, cy, baseRadius, tickMarks]);

  return (
    <g className='occult-rings'>
      {rings.map((ring, i) => (
        <circle
          key={`ring-${i}`}
          cx={cx}
          cy={cy}
          fill='none'
          opacity={ring.opacity}
          r={ring.r}
          stroke='hsl(var(--primary))'
          strokeDasharray={ring.strokeDasharray}
          strokeWidth={ring.strokeWidth}
        />
      ))}
      {ticks.map((tick, i) => (
        <line
          key={`tick-${i}`}
          opacity={tick.opacity}
          stroke='hsl(var(--primary))'
          strokeWidth={tick.strokeWidth}
          x1={tick.x1}
          x2={tick.x2}
          y1={tick.y1}
          y2={tick.y2}
        />
      ))}
    </g>
  );
}

// Cog and wrench paths extracted from the Deadlock logo (logo.tsx).
// Original logo viewBox is 1024x1024, centered around (~507, 509).
// Rendered as faint primary-color strokes (no fills) so it blends as line art.
const LOGO_COG =
  "M874.08,468.44v81.66l-67.86,8.49c-8.07,1-14.62,6.96-16.43,14.88-7.33,32.35-20.08,62.66-37.27,89.91-4.33,6.88-3.89,15.71,1.09,22.13l42.04,54-57.77,57.77-54-42.02c-6.42-5-15.27-5.44-22.13-1.09-27.26,17.17-57.55,29.92-89.91,37.25-7.92,1.81-13.88,8.36-14.88,16.43l-8.49,67.86h-81.66l-8.49-67.86c-1.02-8.07-6.96-14.62-14.88-16.43-32.35-7.33-62.66-20.08-89.91-37.25-6.88-4.35-15.71-3.92-22.13,1.09l-54,42.02-57.77-57.77,42.02-54c4.98-6.42,5.42-15.25,1.09-22.13-17.19-27.24-29.94-57.55-37.27-89.91-1.78-7.92-8.36-13.88-16.41-14.88l-67.89-8.49v-81.66l67.89-8.49c8.05-1.02,14.62-6.96,16.41-14.88,7.33-32.35,20.08-62.66,37.27-89.91,4.33-6.88,3.89-15.71-1.09-22.13l-42.02-54,57.77-57.77,54,42.02c6.42,4.98,15.25,5.42,22.13,1.09,27.24-17.17,57.55-29.94,89.91-37.25,7.92-1.81,13.86-8.38,14.88-16.43l8.49-67.86h81.66l8.49,67.86c1,8.05,6.96,14.62,14.88,16.43,32.35,7.31,62.64,20.08,89.91,37.25,6.85,4.33,15.71,3.89,22.13-1.09l54-42.02,57.77,57.77-42.04,54c-4.98,6.42-5.42,15.25-1.09,22.13,17.19,27.24,29.94,57.55,37.27,89.91,1.81,7.92,8.36,13.86,16.43,14.88l67.86,8.49Z";

const LOGO_WRENCH_PATHS = [
  "M604.84,632.73c9.4,9.44,15.21,2.73,22.92-4.97,7.72-7.7,14.41-13.52,5.01-22.94,0,0-131.03-130.91-163.39-163.18l-27.93,27.92,163.39,163.18h0Z",
  "M389.42,492.28l10.87-10.69s-4.8-13.15,2.23-19.46c7.03-6.3,18.89-2.41,18.89-2.41l38.15-36.87s-2.67-19.17.87-22.71c3.54-3.54,43.11-22.82,46.93-26.68l-8.13-8.13s-55.37,6.66-61.37,12.64c-3.52,3.54-29.88,30.17-48.68,48.97,0,0,4.71,13.44-1.49,19.63-6.21,6.21-20.2,1.77-20.2,1.77-6.6,6.6-11.03,11.01-11.03,11.01-4.66,4.69-1.91,11.28,3.81,16.99l12.14,12.14c5.75,5.74,12.36,8.44,17.01,3.79h0Z",
  "M560.87,465.73c19.07,9.05,42.98,6.27,58.81-9.56,12.21-12.21,17.07-29.01,14.46-44.81l-26.93,26.89-22.91,5.68-25.88-25.53,6.07-23.67,26.68-26.34c-15.81-2.58-33.67,1.15-45.89,13.38-15.84,15.84-18,40.34-8.96,59.43l-17.6,17.58c7.74,7.7,16,15.97,24.57,24.52l17.56-17.58h0Z",
  "M484.73,547.23l-26.64-26.62-23.15,23.17c-1.45,1.42-2.48,3.03-3.2,4.71-1.36-.53-2.12-.55-2.6-.35-4.43-1.47-9.1-2.46-14-2.46-24.45,0-44.26,19.56-44.26,43.71s19.81,43.71,44.26,43.71,44.26-19.56,44.26-43.71c0-5.01-1.04-9.75-2.58-14.23-.09-.42-.11-.81-.35-1.43,1.84-.76,3.58-1.79,5.1-3.33l23.19-23.15h0ZM415.12,614.83c-14.37,0-26.01-11.38-26.01-25.46s11.61-25.46,26.01-25.46,26.01,11.38,26.01,25.46-11.63,25.46-26.01,25.46h0Z",
];

function LogoSigil({
  cx,
  cy,
  scale = 1,
  rotation = 0,
  opacity = 0.16,
}: {
  cx: number;
  cy: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
}) {
  // Logo is 1024x1024; map down to ~20 sigil units, then multiply by caller's scale.
  const baseScale = 0.08 * scale;
  const stroke = "hsl(var(--primary))";
  return (
    <g
      opacity={opacity}
      transform={`translate(${cx},${cy}) rotate(${rotation}) scale(${baseScale}) translate(-507,-509)`}>
      <circle
        cx={507}
        cy={509}
        fill='none'
        r={500}
        stroke={stroke}
        strokeWidth={3}
      />
      <path
        d={LOGO_COG}
        fill='none'
        stroke={stroke}
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={4}
      />
      {LOGO_WRENCH_PATHS.map((d, i) => (
        <path
          d={d}
          fill='none'
          key={`logo-wrench-${i}`}
          stroke={stroke}
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={5}
        />
      ))}
    </g>
  );
}

function Sigil({
  cx,
  cy,
  scale = 1,
  pathIndex,
  rotation = 0,
  opacity = 0.06,
}: {
  cx: number;
  cy: number;
  scale?: number;
  pathIndex: number;
  rotation?: number;
  opacity?: number;
}) {
  const path = ALL_SYMBOL_PATHS[pathIndex % ALL_SYMBOL_PATHS.length];

  return (
    <g
      opacity={opacity}
      transform={`translate(${cx},${cy}) rotate(${rotation}) scale(${scale})`}>
      <path
        d={path}
        fill='none'
        stroke='hsl(var(--primary))'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={0.6}
      />
    </g>
  );
}

function RadialLines({
  cx,
  cy,
  innerRadius,
  outerRadius,
  count,
  opacity = 0.04,
}: {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  count: number;
  opacity?: number;
}) {
  const lines = useMemo(() => {
    const items = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      items.push({
        x1: cx + Math.cos(angle) * innerRadius,
        y1: cy + Math.sin(angle) * innerRadius,
        x2: cx + Math.cos(angle) * outerRadius,
        y2: cy + Math.sin(angle) * outerRadius,
      });
    }
    return items;
  }, [cx, cy, innerRadius, outerRadius, count]);

  return (
    <g opacity={opacity}>
      {lines.map((line, i) => (
        <line
          key={`radial-${i}`}
          stroke='hsl(var(--primary))'
          strokeWidth={0.3}
          x1={line.x1}
          x2={line.x2}
          y1={line.y1}
          y2={line.y2}
        />
      ))}
    </g>
  );
}

function CornerSigil({
  x,
  y,
  rotation,
  mirror = false,
}: {
  x: number;
  y: number;
  rotation: number;
  mirror?: boolean;
}) {
  return (
    <g
      opacity={0.1}
      transform={`translate(${x},${y}) rotate(${rotation}) scale(${mirror ? -1 : 1},1)`}>
      <path
        d='M0,0 L30,0 M0,0 L0,30'
        fill='none'
        stroke='hsl(var(--primary))'
        strokeWidth={0.5}
      />
      <path
        d='M5,0 L5,5 L0,5'
        fill='none'
        stroke='hsl(var(--primary))'
        strokeWidth={0.4}
      />
      <circle
        cx={15}
        cy={15}
        fill='none'
        r={8}
        stroke='hsl(var(--primary))'
        strokeDasharray='2 3'
        strokeWidth={0.3}
      />
      <path
        d='M15,9 L15,21 M9,15 L21,15'
        fill='none'
        stroke='hsl(var(--primary))'
        strokeWidth={0.3}
      />
    </g>
  );
}

export const OccultGeometry = () => {
  const showOccultGeometry = usePersistedStore((s) => s.showOccultGeometry);
  const animateOccultGeometry = usePersistedStore(
    (s) => s.animateOccultGeometry,
  );
  const isWindowFocused = useWindowFocused();
  const animationsEnabled = animateOccultGeometry && isWindowFocused;

  const elements = useMemo(() => {
    const rng = seededRandom(777);
    const sigils = [];
    const positions = [
      { x: 120, y: 180 },
      { x: 850, y: 120 },
      { x: 200, y: 500 },
      { x: 780, y: 450 },
      { x: 500, y: 280 },
      { x: 350, y: 600 },
      { x: 680, y: 580 },
      { x: 900, y: 350 },
      { x: 100, y: 380 },
      { x: 600, y: 680 },
      { x: 420, y: 100 },
      { x: 750, y: 700 },
      { x: 300, y: 150 },
      { x: 550, y: 500 },
      { x: 450, y: 720 },
      { x: 950, y: 550 },
      { x: 650, y: 200 },
      { x: 50, y: 650 },
    ];

    for (let i = 0; i < positions.length; i++) {
      sigils.push({
        ...positions[i],
        pathIndex: Math.floor(rng() * ALL_SYMBOL_PATHS.length),
        rotation: rng() * 360,
        scale: 0.7 + rng() * 0.8,
        opacity: 0.06 + rng() * 0.06,
      });
    }
    return sigils;
  }, []);

  if (!showOccultGeometry) {
    return null;
  }

  return (
    <div
      aria-hidden
      className='occult-geometry-container'
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
        overflow: "hidden",
      }}>
      <svg
        height='100%'
        preserveAspectRatio='xMidYMid slice'
        style={{ position: "absolute", inset: 0 }}
        viewBox='0 0 1000 800'
        width='100%'>
        <defs>
          <radialGradient id='occult-fade-center'>
            <stop offset='0%' stopColor='white' stopOpacity={1} />
            <stop offset='70%' stopColor='white' stopOpacity={0.6} />
            <stop offset='100%' stopColor='white' stopOpacity={0} />
          </radialGradient>
          <radialGradient id='occult-fade-edge'>
            <stop offset='0%' stopColor='white' stopOpacity={0.8} />
            <stop offset='100%' stopColor='white' stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Primary mandala - bottom right area, partially off-screen */}
        <g
          className={animationsEnabled ? "occult-rotate-slow" : undefined}
          style={{ transformOrigin: "780px 620px" }}>
          <ConcentricRings
            baseRadius={80}
            cx={780}
            cy={620}
            ringCount={6}
            seed={101}
          />
          <RadialLines
            count={24}
            cx={780}
            cy={620}
            innerRadius={60}
            opacity={0.07}
            outerRadius={180}
          />
          <LogoSigil
            cx={780}
            cy={620}
            opacity={0.18}
            rotation={15}
            scale={2.4}
          />
        </g>

        {/* Secondary mandala - top left, smaller */}
        <g
          className={animationsEnabled ? "occult-rotate-reverse" : undefined}
          style={{ transformOrigin: "150px 140px" }}>
          <ConcentricRings
            baseRadius={50}
            cx={150}
            cy={140}
            ringCount={4}
            seed={202}
          />
          <RadialLines
            count={12}
            cx={150}
            cy={140}
            innerRadius={35}
            opacity={0.06}
            outerRadius={100}
          />
          <Sigil
            cx={150}
            cy={140}
            opacity={0.1}
            pathIndex={7}
            rotation={30}
            scale={1.2}
          />
        </g>

        {/* Tertiary mandala - center-left, very faint */}
        <g
          className={animationsEnabled ? "occult-rotate-slow" : undefined}
          style={{ transformOrigin: "80px 450px" }}>
          <ConcentricRings
            baseRadius={35}
            cx={80}
            cy={450}
            ringCount={3}
            seed={303}
            tickMarks={false}
          />
          <Sigil
            cx={80}
            cy={450}
            opacity={0.08}
            pathIndex={3}
            rotation={45}
            scale={1}
          />
        </g>

        {/* Small mandala - top right */}
        <g
          className={animationsEnabled ? "occult-rotate-reverse" : undefined}
          style={{ transformOrigin: "920px 80px" }}>
          <ConcentricRings
            baseRadius={30}
            cx={920}
            cy={80}
            ringCount={3}
            seed={404}
            tickMarks={false}
          />
        </g>

        {/* Scattered alchemical sigils */}
        {elements.map((el, i) => (
          <g
            className={
              animationsEnabled
                ? i % 2 === 0
                  ? "occult-pulse-a"
                  : "occult-pulse-b"
                : undefined
            }
            key={`sigil-${i}`}>
            <Sigil
              cx={el.x}
              cy={el.y}
              opacity={el.opacity}
              pathIndex={el.pathIndex}
              rotation={el.rotation}
              scale={el.scale}
            />
          </g>
        ))}

        {/* Horizon line - subtle divider */}
        <line
          opacity={0.06}
          stroke='hsl(var(--primary))'
          strokeDasharray='1 8'
          strokeWidth={0.3}
          x1={0}
          x2={1000}
          y1={400 + GOLDEN_RATIO}
          y2={400 - GOLDEN_RATIO}
        />

        {/* Corner accents */}
        <CornerSigil rotation={0} x={10} y={10} />
        <CornerSigil mirror rotation={90} x={990} y={10} />
        <CornerSigil rotation={-90} x={10} y={790} />
        <CornerSigil mirror rotation={180} x={990} y={790} />

        {/* Arc segments - partial circles floating */}
        <path
          d='M400,50 A120,120 0 0,1 520,170'
          fill='none'
          opacity={0.08}
          stroke='hsl(var(--primary))'
          strokeDasharray='3 5'
          strokeWidth={0.4}
        />
        <path
          d='M600,700 A90,90 0 0,0 510,610'
          fill='none'
          opacity={0.06}
          stroke='hsl(var(--primary))'
          strokeDasharray='2 6'
          strokeWidth={0.3}
        />
        <path
          d='M300,300 A200,200 0 0,1 500,300'
          fill='none'
          opacity={0.05}
          stroke='hsl(var(--primary))'
          strokeWidth={0.3}
        />
      </svg>
    </div>
  );
};
