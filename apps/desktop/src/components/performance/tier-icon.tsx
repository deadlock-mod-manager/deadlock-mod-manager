import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PerfTier } from "@/types/generated/PerfTier";

/**
 * Each tier drawn with fewer sides than the last, the way a game drops
 * level of detail: a smooth sphere, then an octagon, a hexagon, a diamond, and
 * finally a low-poly potato. No triangle, which reads as a warning sign. Drawn on Phosphor's 256 grid with its 16px round
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
      points='162.4,44.8 211.2,93.6 211.2,162.4 162.4,211.2 93.6,211.2 44.8,162.4 44.8,93.6 93.6,44.8'
    />
  ),
  lean: (
    <polygon
      pathLength='1'
      points='128,40 204,84 204,172 128,216 52,172 52,84'
    />
  ),
  sweaty: <polygon pathLength='1' points='128,36 220,128 128,220 36,128' />,
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
    data-tier={tier}
    fill='none'
    stroke='currentColor'
    strokeLinecap='round'
    strokeLinejoin='round'
    strokeWidth='16'
    viewBox='0 0 256 256'>
    {TIER_GLYPHS[tier]}
  </svg>
);
