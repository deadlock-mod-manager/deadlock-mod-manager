import { type CSSProperties, useId, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { pick, random } from "./effect-canvas";

export const EGG_COUNT = 5;

const EGG_COLORS = [
  ["hsl(340 80% 78%)", "hsl(48 95% 75%)"],
  ["hsl(268 75% 80%)", "hsl(155 60% 72%)"],
  ["hsl(195 80% 75%)", "hsl(340 80% 82%)"],
  ["hsl(48 95% 72%)", "hsl(268 70% 70%)"],
  ["hsl(155 55% 70%)", "hsl(25 95% 75%)"],
] as const;

type EggPattern = "stripes" | "dots" | "zigzag";

type HiddenEgg = {
  id: number;
  edge: "bottom" | "right";
  offset: number;
  tilt: number;
  colors: readonly [string, string];
  pattern: EggPattern;
};

const hideEggs = (round: number): HiddenEgg[] =>
  Array.from({ length: EGG_COUNT }, (_, index) => ({
    id: round * EGG_COUNT + index,
    edge: index % 2 === 0 ? "bottom" : "right",
    offset: random(index % 2 === 0 ? 28 : 18, index % 2 === 0 ? 88 : 78),
    tilt: random(-28, 28),
    colors: EGG_COLORS[index % EGG_COLORS.length],
    pattern: pick(["stripes", "dots", "zigzag"] as const),
  }));

export const useEggHunt = create<{
  round: number;
  found: number[];
  collect: (id: number) => void;
  reset: () => void;
}>((set) => ({
  round: 0,
  found: [],
  collect: (id) =>
    set((state) =>
      state.found.includes(id) ? state : { found: [...state.found, id] },
    ),
  reset: () => set((state) => ({ round: state.round + 1, found: [] })),
}));

export const EasterEgg = ({
  colors,
  pattern,
  className,
}: {
  colors: readonly [string, string];
  pattern: EggPattern;
  className?: string;
}) => {
  const clipId = useId();
  return (
    <svg aria-hidden viewBox='0 0 32 42' className={className}>
      <defs>
        <clipPath id={clipId}>
          <path d='M16 1C25 1 31 17 31 26 31 36 24 41 16 41 8 41 1 36 1 26 1 17 7 1 16 1Z' />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width='32' height='42' fill={colors[0]} />
        {pattern === "stripes" ? (
          <>
            <rect y='14' width='32' height='4' fill={colors[1]} />
            <rect y='24' width='32' height='4' fill={colors[1]} />
            <rect y='31' width='32' height='2' fill='white' opacity='0.7' />
          </>
        ) : pattern === "dots" ? (
          [
            [9, 12],
            [21, 10],
            [15, 20],
            [7, 27],
            [24, 26],
            [15, 34],
          ].map(([cx, cy]) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r='2.6'
              fill={colors[1]}
            />
          ))
        ) : (
          <path
            d='M0 22 4 18 8 22 12 18 16 22 20 18 24 22 28 18 32 22V28L28 24 24 28 20 24 16 28 12 24 8 28 4 24 0 28Z'
            fill={colors[1]}
          />
        )}
        <ellipse cx='10' cy='12' rx='3' ry='6' fill='white' opacity='0.35' />
      </g>
    </svg>
  );
};

/** Five eggs peek out from the screen edges; the sidebar basket counts the ones found. */
export const EggHunt = () => {
  const { t } = useTranslation();
  const round = useEggHunt((state) => state.round);
  const found = useEggHunt((state) => state.found);
  const collect = useEggHunt((state) => state.collect);
  const eggs = useMemo(() => hideEggs(round), [round]);

  return createPortal(
    <>
      {eggs
        .filter((egg) => !found.includes(egg.id))
        .map((egg) => (
          <button
            key={egg.id}
            type='button'
            className='seasonal-hidden-egg'
            data-edge={egg.edge}
            style={
              {
                [egg.edge === "bottom" ? "left" : "top"]: `${egg.offset}%`,
                "--egg-tilt": `${egg.tilt}deg`,
              } as CSSProperties
            }
            aria-label={t("plugins.seasonal.easter.hiddenEgg")}
            title={t("plugins.seasonal.easter.hiddenEgg")}
            onClick={() => collect(egg.id)}>
            <EasterEgg colors={egg.colors} pattern={egg.pattern} />
          </button>
        ))}
    </>,
    document.body,
  );
};

export const BASKET_EGGS = EGG_COLORS.map((colors, index) => ({
  colors,
  pattern: (["stripes", "dots", "zigzag"] as const)[index % 3],
}));
