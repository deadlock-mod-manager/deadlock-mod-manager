import {
  type ChartConfig,
  ChartContainer,
} from "@deadlock-mods/ui/components/chart";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { LivePanel } from "@/components/stats/live-parts";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import type { SoulsPoint } from "@/hooks/use-live-match";
import type { PerformanceCurvePoint } from "@/lib/stats/api";
import { formatThousands, formatWhole } from "@/lib/stats/format";
import { curveAt } from "@/lib/stats/live-grades";
import { cn } from "@/lib/utils";

interface LiveSoulsCurveProps {
  className?: string;
  curve: PerformanceCurvePoint[];
  trail: SoulsPoint[];
  minutes: number;
  souls: number;
  color: string;
}

/** Matches run past this often enough that the axis starts there. */
const MIN_AXIS_MINUTES = 25;
/** Souls gridlines sit on round numbers. */
const Y_STEP = 5000;
/** How far back "lately" reaches for the recent souls rate. */
const RECENT_MINUTES = 3;

const BRACKET = "hsl(var(--primary))";

const AXIS_TICK = {
  fontSize: 10,
  fontFamily: '"Geist Mono Variable", monospace',
  fill: "hsl(var(--muted-foreground) / 0.7)",
};

/** Minute ticks, with the first and last flush to the plot's edges. */
const TimeTick = ({
  end,
  x,
  y,
  payload,
}: {
  end: number;
  x?: number;
  y?: number;
  payload?: { value: number };
}) => {
  if (x === undefined || y === undefined || !payload) return null;
  const anchor =
    payload.value === 0 ? "start" : payload.value === end ? "end" : "middle";
  return (
    <text {...AXIS_TICK} dy={10} textAnchor={anchor} x={x} y={y}>
      {`${payload.value}:00`}
    </text>
  );
};

/** Your souls and lead beside the "now" dot; recharts passes the dot's box. */
const Callout = ({
  souls,
  lead,
  lagging,
  viewBox,
}: {
  souls: string;
  lead: string | null;
  lagging: boolean;
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
}) => {
  if (viewBox?.x === undefined || viewBox.y === undefined) return null;
  const charWidth = 6.6;
  const width = (souls.length + (lead ? lead.length + 1 : 0)) * charWidth + 16;
  const centerY = viewBox.y + (viewBox.height ?? 0) / 2;
  const left = viewBox.x - width - 12;
  return (
    <g transform={`translate(${left}, ${centerY - 11})`}>
      <rect
        fill='hsl(var(--secondary))'
        height={22}
        rx={7}
        stroke='hsl(var(--border))'
        width={width}
      />
      <text
        className='font-mono'
        dominantBaseline='central'
        fontSize={11}
        fontWeight={700}
        x={8}
        y={11}>
        <tspan fill='hsl(var(--foreground))'>{souls}</tspan>
        {lead && (
          <tspan dx={6} fill={lagging ? LOSS_COLOR : WIN_COLOR}>
            {lead}
          </tspan>
        )}
      </text>
    </g>
  );
};

const config = {
  you: { label: "You", color: "var(--team-0)" },
} satisfies ChartConfig;

/**
 * Your souls this match against the bracket's curve: its average and middle
 * 68%, with your current lead carried to the end of the axis.
 */
export const LiveSoulsCurve = ({
  className,
  curve,
  trail,
  minutes,
  souls,
  color,
}: LiveSoulsCurveProps) => {
  const { t } = useTranslation();

  const { bracket, projection, end, now, yTicks } = useMemo(() => {
    const end = Math.max(MIN_AXIS_MINUTES, Math.ceil(minutes / 5) * 5 + 5);
    const at = (m: number) => curveAt(curve, "net_worth", m * 60);
    const bracket = Array.from({ length: end + 1 }, (_, m) => {
      const point = at(m);
      return {
        minutes: m,
        avg: point?.avg ?? 0,
        band: point
          ? [Math.max(0, point.avg - point.std), point.avg + point.std]
          : [0, 0],
      };
    });
    const now = at(minutes);
    const ratio = now && now.avg > 0 ? souls / now.avg : 1;
    const projection = [
      { minutes, projected: souls },
      ...bracket
        .filter((point) => point.minutes > minutes)
        .map((point) => ({
          minutes: point.minutes,
          projected: point.avg * ratio,
        })),
    ];
    // The band and the projection may run off the top; the axis follows the
    // bracket's average and you, so the curve keeps its shape.
    const highest = Math.max(souls, bracket.at(-1)?.avg ?? 0);
    const top = Math.ceil(highest / Y_STEP) * Y_STEP;
    const yTicks = Array.from(
      { length: top / Y_STEP + 1 },
      (_, i) => i * Y_STEP,
    );
    return { bracket, projection, end, now, yTicks };
  }, [curve, minutes, souls]);

  const lead = now ? souls - now.avg : null;
  const recent = useMemo(() => {
    const since = minutes - RECENT_MINUTES;
    const past = trail.find((point) => point.minutes >= since);
    if (!past || minutes - past.minutes < RECENT_MINUTES / 2) return null;
    const span = minutes - past.minutes;
    const then = curveAt(curve, "net_worth", past.minutes * 60);
    const bracketNow = curveAt(curve, "net_worth", minutes * 60);
    return {
      rate: (souls - past.souls) / span,
      ahead:
        !then || !bracketNow
          ? null
          : souls - past.souls >= bracketNow.avg - then.avg,
    };
  }, [curve, trail, minutes, souls]);
  const atEnd = projection.at(-1)?.projected ?? null;
  const you = [
    ...trail.filter((point) => point.minutes < minutes),
    {
      minutes,
      souls,
    },
  ];

  const legend = [
    {
      label: t("stats.live.souls.you"),
      swatch: { height: 2.5, background: color },
    },
    {
      label: t("stats.live.souls.bracket"),
      swatch: { height: 2, background: tint(BRACKET, 40) },
    },
    {
      label: t("stats.live.souls.band"),
      swatch: { height: 8, background: tint(BRACKET, 12) },
    },
    {
      label: t("stats.live.souls.projected"),
      swatch: { height: 2, background: tint(color, 35) },
    },
  ];

  const leadText =
    lead === null
      ? null
      : `${lead >= 0 ? "+" : "−"}${formatThousands(Math.abs(lead))}`;

  return (
    <LivePanel
      className={cn("h-full", className)}
      description={t("stats.live.souls.description")}
      title={t("stats.live.souls.title")}>
      <div className='flex flex-1 flex-col justify-between gap-5 pt-5'>
        <ChartContainer
          className='aspect-auto min-h-40 w-full flex-1'
          config={config}>
          <ComposedChart margin={{ left: 0, right: 14, top: 6, bottom: 0 }}>
            <CartesianGrid
              stroke='hsl(var(--foreground))'
              strokeOpacity={0.03}
              vertical={false}
            />
            <XAxis
              allowDuplicatedCategory={false}
              axisLine={false}
              dataKey='minutes'
              domain={[0, end]}
              height={22}
              tick={<TimeTick end={end} />}
              tickLine={false}
              ticks={Array.from({ length: end / 5 + 1 }, (_, i) => i * 5)}
              type='number'
            />
            <YAxis
              allowDataOverflow
              axisLine={false}
              domain={[0, yTicks.at(-1) ?? Y_STEP]}
              tick={AXIS_TICK}
              tickFormatter={(value: number) =>
                value === 0 ? "0" : `${value / 1000}k`
              }
              tickLine={false}
              ticks={yTicks}
              width={32}
            />
            <Area
              data={bracket}
              dataKey='band'
              fill={tint(BRACKET, 5)}
              isAnimationActive={false}
              stroke='none'
              type='monotone'
            />
            <Line
              data={bracket}
              dataKey='avg'
              dot={false}
              isAnimationActive={false}
              stroke={tint(BRACKET, 35)}
              strokeWidth={1.5}
              type='monotone'
            />
            <Line
              data={projection}
              dataKey='projected'
              dot={false}
              isAnimationActive={false}
              stroke={tint(color, 35)}
              strokeWidth={1.5}
              type='monotone'
            />
            <Line
              data={you}
              dataKey='souls'
              dot={false}
              isAnimationActive={false}
              stroke={color}
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2.25}
              type='monotone'
            />
            <ReferenceLine
              stroke='hsl(var(--foreground))'
              strokeOpacity={0.1}
              x={minutes}
            />
            <ReferenceDot
              fill={tint(color, 20)}
              r={9}
              stroke='none'
              x={minutes}
              y={souls}
            />
            <ReferenceDot
              fill={color}
              label={
                <Callout
                  lagging={lead !== null && lead < 0}
                  lead={leadText}
                  souls={formatThousands(souls)}
                />
              }
              r={5}
              stroke='hsl(var(--background))'
              strokeWidth={2}
              x={minutes}
              y={souls}
            />
          </ComposedChart>
        </ChartContainer>

        <div className='grid grid-cols-2 rounded-[10px] border bg-background'>
          <div className='flex flex-col gap-[3px] px-3 py-[9px]'>
            <span className='text-[11px] text-muted-foreground leading-[14px]'>
              {t("stats.live.souls.recent", { minutes: RECENT_MINUTES })}
            </span>
            <span
              className='font-bold font-mono text-sm leading-[18px] tabular-nums'
              style={
                !recent || recent.ahead === null
                  ? undefined
                  : { color: recent.ahead ? WIN_COLOR : LOSS_COLOR }
              }>
              {recent === null
                ? "–"
                : t("stats.live.now.perMinute", {
                    value: formatWhole(recent.rate),
                  })}
            </span>
          </div>
          <div className='flex flex-col gap-[3px] border-l px-3 py-[9px]'>
            <span className='text-[11px] text-muted-foreground leading-[14px]'>
              {t("stats.live.souls.atEnd", { clock: `${end}:00` })}
            </span>
            <span className='font-bold font-mono text-sm leading-[18px] tabular-nums'>
              {atEnd === null ? "–" : formatThousands(atEnd)}
            </span>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground leading-[15px]'>
          {legend.map((item) => (
            <span className='flex items-center gap-1.5' key={item.label}>
              <span
                className='w-3.5 rounded-[2px]'
                style={{
                  height: item.swatch.height,
                  background: item.swatch.background,
                }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </LivePanel>
  );
};
