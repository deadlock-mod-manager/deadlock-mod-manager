import {
  CheckIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  XIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

export type BisectScene = "split" | "check" | "narrow" | "restore";

type TileState = "on" | "off" | "cleared" | "culprit";

const TILE_COUNT = 8;
const CULPRIT = 5;
const FRAME_MS = 1500;

const range = (from: number, to: number) =>
  Array.from({ length: TILE_COUNT }, (_, index) => index >= from && index < to);

/** Each frame lists the tile states plus the bracket over the tested group. */
type Frame = { tiles: TileState[]; bracket?: [number, number]; round?: number };

const tiles = (mask: boolean[], inside: TileState, outside: TileState) =>
  mask.map((inMask) => (inMask ? inside : outside));

const FRAMES = {
  split: [
    { tiles: tiles(range(0, 8), "on", "on") },
    { tiles: tiles(range(4, 8), "on", "off"), bracket: [4, 8] },
    { tiles: tiles(range(4, 8), "on", "off"), bracket: [4, 8] },
  ],
  narrow: [
    { tiles: tiles(range(4, 8), "on", "cleared"), bracket: [4, 8], round: 1 },
    { tiles: tiles(range(4, 6), "on", "cleared"), bracket: [4, 6], round: 2 },
    {
      tiles: tiles(range(CULPRIT, CULPRIT + 1), "culprit", "cleared"),
      bracket: [CULPRIT, CULPRIT + 1],
      round: 3,
    },
    {
      tiles: tiles(range(CULPRIT, CULPRIT + 1), "culprit", "cleared"),
      bracket: [CULPRIT, CULPRIT + 1],
      round: 3,
    },
  ],
  restore: [
    { tiles: tiles(range(CULPRIT, CULPRIT + 1), "culprit", "off") },
    { tiles: tiles(range(CULPRIT, CULPRIT + 1), "off", "on") },
    { tiles: tiles(range(CULPRIT, CULPRIT + 1), "off", "on") },
  ],
} satisfies Record<Exclude<BisectScene, "check">, Frame[]>;

const CHECK_FRAMES = 4;

const TILE_HUES = [1, 2, 3, 4, 5, 2, 1, 3];
const TILE_IDS = TILE_HUES.map((_, index) => `tile-${index}`);

/** Loops through `count` frames; holds the last one for reduced motion. */
const useFrame = (count: number) => {
  const reduced = usePrefersReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % count),
      FRAME_MS,
    );
    return () => window.clearInterval(timer);
  }, [count, reduced]);
  return reduced ? count - 1 : frame;
};

const Tile = ({ state, index }: { state: TileState; index: number }) => {
  const isOn = state === "on" || state === "culprit";
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-md border bg-card transition-all duration-500 ease-[var(--ease-dmm-smooth)]",
        state === "off" && "opacity-40 grayscale",
        state === "cleared" && "scale-90 opacity-20 grayscale",
        state === "culprit" &&
          "z-10 -translate-y-1 scale-110 border-destructive shadow-[0_0_0_2px_hsl(var(--destructive)/0.6),0_8px_24px_-8px_hsl(var(--destructive)/0.7)]",
      )}>
      <div
        className='h-7'
        style={{
          background: `linear-gradient(135deg, hsl(var(--chart-${TILE_HUES[index]}) / 0.85), hsl(var(--chart-${TILE_HUES[index]}) / 0.35))`,
        }}
      />
      <div className='flex items-center justify-center py-1.5'>
        <span
          className={cn(
            "relative h-2.5 w-5 rounded-full transition-colors duration-500",
            isOn ? "bg-primary" : "bg-muted",
          )}>
          <span
            className={cn(
              "absolute top-0.5 size-1.5 rounded-full bg-background transition-transform duration-500",
              isOn ? "translate-x-3" : "translate-x-0.5",
            )}
          />
        </span>
      </div>
      {state === "cleared" && (
        <CheckIcon
          className='absolute inset-0 m-auto size-4 text-status-ok'
          weight='bold'
        />
      )}
      {state === "culprit" && (
        <MagnifyingGlassIcon
          className='absolute top-0.5 right-0.5 size-3.5 text-destructive-foreground motion-safe:animate-bounce'
          weight='bold'
        />
      )}
    </div>
  );
};

const TileRow = ({ frame }: { frame: Frame }) => {
  const { t } = useTranslation();
  return (
    <div className='w-full max-w-sm'>
      <div className='grid grid-cols-8 gap-1.5'>
        {TILE_IDS.map((id, index) => (
          <Tile index={index} key={id} state={frame.tiles[index]} />
        ))}
      </div>
      <div className='mt-2 grid h-6 grid-cols-8 gap-1.5'>
        {frame.bracket && (
          <div
            className='flex flex-col items-center transition-all duration-500'
            style={{
              gridColumn: `${frame.bracket[0] + 1} / span ${frame.bracket[1] - frame.bracket[0]}`,
            }}>
            <span className='h-1.5 w-full rounded-b border-x-2 border-b-2 border-primary/70' />
            <span className='mt-0.5 whitespace-nowrap text-[10px] font-medium text-primary'>
              {frame.round
                ? t("bisect.explainer.illustration.launch", {
                    round: frame.round,
                  })
                : t("bisect.explainer.illustration.testing")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const CheckScene = ({ frame }: { frame: number }) => {
  const { t } = useTranslation();
  const broken = frame === 1;
  const fine = frame === 2 || frame === 3;
  return (
    <div className='flex w-full max-w-sm items-center gap-4'>
      <div
        className={cn(
          "relative flex h-24 flex-1 items-center justify-center overflow-hidden rounded-md border bg-background transition-colors duration-500",
          broken && "border-destructive/60",
          fine && "border-status-ok/60",
        )}>
        <span className='absolute top-1.5 left-2 flex gap-1'>
          <span className='size-1.5 rounded-full bg-muted-foreground/40' />
          <span className='size-1.5 rounded-full bg-muted-foreground/40' />
        </span>
        {frame === 0 && (
          <PlayIcon
            className='size-8 text-primary motion-safe:animate-pulse'
            weight='fill'
          />
        )}
        {broken && (
          <div className='absolute inset-0 flex flex-col justify-center gap-1.5 px-3 motion-safe:animate-pulse'>
            <span className='h-1.5 w-3/4 rounded bg-destructive/70' />
            <span className='ml-4 h-1.5 w-1/2 rounded bg-destructive/50' />
            <span className='h-1.5 w-2/3 rounded bg-destructive/70' />
          </div>
        )}
        {fine && (
          <CheckIcon
            className='size-8 text-status-ok motion-safe:animate-in motion-safe:zoom-in-50'
            weight='bold'
          />
        )}
      </div>
      <div className='flex w-36 flex-col gap-2'>
        <AnswerChip
          active={broken}
          hint={t("bisect.explainer.illustration.brokenHint")}
          icon={<XIcon className='size-3.5' weight='bold' />}
          label={t("bisect.answers.broken")}
          tone='destructive'
        />
        <AnswerChip
          active={fine}
          hint={t("bisect.explainer.illustration.fineHint")}
          icon={<CheckIcon className='size-3.5' weight='bold' />}
          label={t("bisect.answers.fine")}
          tone='ok'
        />
      </div>
    </div>
  );
};

const AnswerChip = ({
  active,
  hint,
  icon,
  label,
  tone,
}: {
  active: boolean;
  hint: string;
  icon: ReactNode;
  label: string;
  tone: "destructive" | "ok";
}) => (
  <div
    className={cn(
      "rounded-md border px-2.5 py-1.5 transition-all duration-500",
      active
        ? tone === "destructive"
          ? "border-destructive/60 bg-destructive/15"
          : "border-status-ok/60 bg-status-ok/15"
        : "opacity-50",
    )}>
    <p className='flex items-center gap-1.5 text-xs font-medium'>
      {icon}
      {label}
    </p>
    <p
      className={cn(
        "text-[10px] leading-tight text-muted-foreground transition-opacity duration-500",
        active ? "opacity-100" : "opacity-0",
      )}>
      {hint}
    </p>
  </div>
);

const TileScene = ({ frames }: { frames: Frame[] }) => {
  const frame = useFrame(frames.length);
  return <TileRow frame={frames[frame]} />;
};

const AnimatedCheckScene = () => {
  const frame = useFrame(CHECK_FRAMES);
  return <CheckScene frame={frame} />;
};

export const BisectIllustration = ({ scene }: { scene: BisectScene }) => (
  <div
    aria-hidden='true'
    className='flex h-44 items-center justify-center rounded-lg border bg-background/60 px-6'>
    {scene === "check" ? (
      <AnimatedCheckScene />
    ) : (
      <TileScene frames={FRAMES[scene]} key={scene} />
    )}
  </div>
);
