import { useMemo } from "react";

const GOLDEN_RATIO = 1.618033988749;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
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
  const rng = seededRandom(seed);

  const rings = useMemo(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, cy, baseRadius, ringCount]);

  const ticks = useMemo(() => {
    if (!tickMarks) return [];
    const items = [];
    const primaryRadius = baseRadius;
    const tickCount = 36;
    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2;
      const isCardinal = i % 9 === 0;
      const len = isCardinal ? 8 : i % 3 === 0 ? 5 : 3;
      items.push({
        x1: cx + Math.cos(angle) * (primaryRadius - len),
        y1: cy + Math.sin(angle) * (primaryRadius - len),
        x2: cx + Math.cos(angle) * (primaryRadius + 1),
        y2: cy + Math.sin(angle) * (primaryRadius + 1),
        opacity: isCardinal ? 0.2 : 0.1,
        strokeWidth: isCardinal ? 0.7 : 0.4,
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          className='occult-rotate-slow'
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
          <Sigil
            cx={780}
            cy={620}
            opacity={0.14}
            pathIndex={4}
            rotation={15}
            scale={1.8}
          />
        </g>

        {/* Secondary mandala - top left, smaller */}
        <g
          className='occult-rotate-reverse'
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
          className='occult-rotate-slow'
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
          className='occult-rotate-reverse'
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
            className={i % 2 === 0 ? "occult-pulse-a" : "occult-pulse-b"}
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
