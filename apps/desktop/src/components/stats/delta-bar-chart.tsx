import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { formatSignedPercent } from "@/lib/stats/format";

/** One row of a diverging bar chart. */
export interface DeltaBar {
  /**
   * Stable identity. Deliberately not the label: two mates can share a persona
   * and two items can share a name, and React would then reuse the wrong cell.
   */
  id: string | number;
  label: string;
  /** The plotted value, in whole percent. */
  delta: number;
  /** The same value as a fraction, for the number printed beside the bar. */
  rawDelta: number;
  /**
   * Whether this bar is an improvement. Not the same as `delta >= 0` - more
   * deaths than average is a worse result, not a better one.
   */
  isPositive: boolean;
  /** Pre-translated, because only the caller knows what the numbers mean. */
  tooltip: string;
}

interface DeltaBarChartProps {
  bars: DeltaBar[];
  /** Series name, shown in the chart config. */
  seriesLabel: string;
  /** Fixed axis bounds; omitted lets recharts fit the data. */
  domain?: [number, number];
  /** Room for the category labels on the left. */
  labelWidth?: number;
  /** Longer labels are clipped here rather than by recharts, which cuts the start. */
  maxLabelChars?: number;
  height?: number;
}

/**
 * The shape every "how far from the baseline" comparison on this page takes:
 * horizontal bars either side of zero, coloured by whether the difference is an
 * improvement, with both values spelled out in the tooltip.
 */
export const DeltaBarChart = ({
  bars,
  seriesLabel,
  domain,
  labelWidth = 150,
  maxLabelChars,
  height,
}: DeltaBarChartProps) => {
  const config = { delta: { label: seriesLabel } } satisfies ChartConfig;

  return (
    <ChartContainer
      className='aspect-auto w-full'
      config={config}
      style={{ height: `${height ?? Math.max(200, bars.length * 34)}px` }}>
      <BarChart
        data={bars}
        layout='vertical'
        margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
        <XAxis
          axisLine={false}
          domain={domain}
          tickFormatter={(value: number) => `${Math.round(value)}%`}
          tickLine={false}
          type='number'
        />
        <YAxis
          axisLine={false}
          dataKey='label'
          // Without this recharts thins the ticks out and half the bars end up
          // unlabelled.
          interval={0}
          tickFormatter={(value: string) =>
            maxLabelChars && value.length > maxLabelChars
              ? `${value.slice(0, maxLabelChars - 1)}…`
              : value
          }
          tickLine={false}
          type='category'
          width={labelWidth}
        />
        <ReferenceLine stroke='hsl(var(--border))' x={0} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_value, _name, item) => (
                <span className='font-medium'>
                  {String(item?.payload?.tooltip ?? "")}
                </span>
              )}
              labelFormatter={(_, payload) =>
                String(payload?.[0]?.payload?.label ?? "")
              }
            />
          }
          cursor={{ fill: "hsl(var(--accent))" }}
        />
        <Bar dataKey='delta' maxBarSize={20} radius={4}>
          {bars.map((bar) => (
            <Cell
              fill={
                bar.isPositive ? "var(--viz-positive)" : "var(--viz-negative)"
              }
              key={bar.id}
            />
          ))}
          <LabelList
            className='fill-muted-foreground'
            dataKey='rawDelta'
            fontSize={11}
            formatter={(value: number) => formatSignedPercent(value, 0)}
            position='right'
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
};
