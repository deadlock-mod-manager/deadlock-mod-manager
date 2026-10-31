import { useEffect, useMemo, useRef, useState } from "react";

/** One bar and its gap. */
const BAR_PITCH_PX = 4;

export const Waveform = ({
  peaks,
  height,
  played,
  tone,
}: {
  peaks: number[] | null;
  height: number;
  played: number;
  tone: "primary" | "ember";
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setBars(Math.floor(entry.contentRect.width / BAR_PITCH_PX)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Each bar takes the loudest peak in its span, so a quiet gap between two
  // hits never hides one of them.
  const values = useMemo(() => {
    if (!peaks) return Array.from({ length: bars }, () => 0.08);
    const span = peaks.length / Math.max(bars, 1);
    return Array.from({ length: bars }, (_, i) =>
      Math.max(
        ...peaks.slice(
          Math.floor(i * span),
          Math.max(Math.floor((i + 1) * span), Math.floor(i * span) + 1),
        ),
      ),
    );
  }, [peaks, bars]);
  const playedBars = Math.round(played * bars);
  const barPath = (from: number, to: number) =>
    values
      .slice(from, to)
      .map((value, i) => {
        const x = (from + i) * BAR_PITCH_PX + 1;
        const half = Math.max(1, (value * height) / 2);
        return `M${x} ${height / 2 - half}V${height / 2 + half}`;
      })
      .join("");

  return (
    <div aria-hidden className='w-full' ref={ref} style={{ height }}>
      <svg
        className='block'
        height={height}
        role='presentation'
        width={bars * BAR_PITCH_PX}>
        <path
          className='stroke-muted-foreground/30'
          d={barPath(playedBars, bars)}
          strokeLinecap='round'
          strokeWidth={2}
        />
        <path
          className={tone === "ember" ? "stroke-orange-400" : "stroke-primary"}
          d={barPath(0, playedBars)}
          strokeLinecap='round'
          strokeWidth={2}
        />
      </svg>
    </div>
  );
};
