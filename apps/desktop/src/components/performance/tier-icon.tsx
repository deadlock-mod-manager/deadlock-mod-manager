import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PerfTier } from "@/types/generated/PerfTier";

/**
 * Each tier drawn with fewer sides than the last, the way a game drops
 * level of detail: a smooth sphere, then a hexagon, a square, a triangle, and
 * finally a low-poly potato. Drawn on Phosphor's 256 grid with its 16px round
 * stroke so they sit with the app's other icons.
 */
const TIER_GLYPHS = {
  pretty: (
    <>
      <circle cx='128' cy='128' pathLength='1' r='88' />
      <path d='M84,128a44,44,0,0,1,44-44' pathLength='1' />
    </>
  ),
  balanced: (
    <polygon
      pathLength='1'
      points='128,40 204,84 204,172 128,216 52,172 52,84'
    />
  ),
  lean: <rect height='144' pathLength='1' width='144' x='56' y='56' />,
  sweaty: <polygon pathLength='1' points='128,40 220,200 36,200' />,
  potato: (
    <>
      <polygon
        pathLength='1'
        points='72,88 116,50 178,44 216,80 212,140 174,194 110,212 58,188 40,136'
      />
      <circle cx='108' cy='104' fill='currentColor' r='10' stroke='none' />
      <circle cx='164' cy='96' fill='currentColor' r='10' stroke='none' />
      <circle cx='136' cy='156' fill='currentColor' r='10' stroke='none' />
    </>
  ),
} satisfies Record<PerfTier, ReactNode>;

/**
 * Takes the surrounding text color. `draw` traces the outline in once, for the
 * moment a config is applied.
 */
export const TierIcon = ({
  tier,
  className,
  draw = false,
}: {
  tier: PerfTier;
  className?: string;
  draw?: boolean;
}) => (
  <svg
    aria-hidden
    className={cn("size-4 shrink-0", draw && "perf-draw", className)}
    fill='none'
    stroke='currentColor'
    strokeLinecap='round'
    strokeLinejoin='round'
    strokeWidth='16'
    viewBox='0 0 256 256'>
    {TIER_GLYPHS[tier]}
  </svg>
);
