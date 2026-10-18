import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@deadlock-mods/ui/components/chart";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  type CellValue,
  type Dataset,
  type DatasetField,
  type DatasetRow,
  fieldByKey,
  numericValue,
} from "@/lib/stats/dashboard/dataset";
import type { WidgetView } from "@/lib/stats/dashboard/layout";
import { prepareRows } from "@/lib/stats/dashboard/prepare";
import { seriesColor } from "./chart-colors";
import { useFieldFormat } from "./use-field-format";
import { KpiView, RadialView, TableView } from "./widget-views";

const PIE_SLICES = 8;
const LABEL_CHARS = 18;

/** Series data keys are positional so field names never end up in CSS variables. */
const seriesKey = (index: number) => `s${index}`;

const clip = (text: string, max = LABEL_CHARS) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

interface PlotRow {
  label: string;
  row: DatasetRow;
  [series: string]: number | string | null | DatasetRow;
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
  payload?: PlotRow;
}

const SeriesTooltip = ({
  active,
  payload,
  series,
  formatValue,
  fieldLabel,
  showLabel = true,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  series: DatasetField[];
  formatValue: (value: CellValue | undefined, field?: DatasetField) => string;
  fieldLabel: (field: DatasetField | undefined) => string;
  showLabel?: boolean;
}) => {
  if (!active || !payload?.length) {
    return null;
  }
  const label = payload[0].payload?.label;
  return (
    <div className='grid min-w-[8rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-md'>
      {showLabel && label && <div className='font-medium'>{label}</div>}
      {payload.map((entry) => {
        const index = Number(String(entry.dataKey ?? "s0").slice(1));
        const field = series[index];
        const raw = typeof entry.value === "number" ? entry.value : null;
        return (
          <div
            className='flex items-center justify-between gap-3'
            key={String(entry.dataKey)}>
            <span className='flex items-center gap-1.5 text-muted-foreground'>
              <span
                className='h-2.5 w-2.5 shrink-0 rounded-[2px]'
                style={{ backgroundColor: entry.color }}
              />
              {fieldLabel(field)}
            </span>
            <span className='font-medium tabular-nums'>
              {formatValue(raw, field)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

interface WidgetChartProps {
  dataset: Dataset;
  view: WidgetView;
}

export const WidgetChart = ({ dataset, view }: WidgetChartProps) => {
  const { fieldLabel, formatValue } = useFieldFormat(dataset);

  const xField = fieldByKey(dataset, view.x);
  const series = useMemo(
    () =>
      view.y.flatMap((key) => {
        const field = fieldByKey(dataset, key);
        return field ? [field] : [];
      }),
    [dataset, view.y],
  );

  const rows = useMemo(() => prepareRows(dataset, view), [dataset, view]);

  const plot = useMemo<PlotRow[]>(
    () =>
      rows.map((row) => ({
        label: xField ? formatValue(row[xField.key], xField) : "",
        row,
        ...Object.fromEntries(
          series.map((field, index) => [
            seriesKey(index),
            numericValue(row[field.key]),
          ]),
        ),
      })),
    [rows, series, xField, formatValue],
  );

  const config = useMemo(
    () =>
      Object.fromEntries(
        series.map((field, index) => [
          seriesKey(index),
          { label: fieldLabel(field), color: seriesColor(view, index) },
        ]),
      ) satisfies ChartConfig,
    [series, fieldLabel, view],
  );

  const tooltip = (
    <ChartTooltip
      content={
        <SeriesTooltip
          fieldLabel={fieldLabel}
          formatValue={formatValue}
          series={series}
        />
      }
      cursor={{ fill: "hsl(var(--accent))", stroke: "hsl(var(--border))" }}
    />
  );
  const legend = view.showLegend && series.length > 1 && (
    <ChartLegend content={<ChartLegendContent />} />
  );
  const grid = view.showGrid && (
    <CartesianGrid stroke='hsl(var(--chart-grid))' vertical={false} />
  );
  const valueTick = (value: number) => formatValue(value, series[0]);
  const curve = view.smooth ? "monotone" : "linear";

  switch (view.chart) {
    case "kpi":
      return (
        <KpiView dataset={dataset} rows={rows} series={series} view={view} />
      );
    case "radial":
      return (
        <RadialView dataset={dataset} rows={rows} series={series} view={view} />
      );
    case "table":
      return <TableView dataset={dataset} rows={rows} view={view} />;
    case "line":
    case "area": {
      const Chart = view.chart === "line" ? LineChart : AreaChart;
      return (
        <ChartContainer className='aspect-auto h-full w-full' config={config}>
          <Chart data={plot} margin={{ left: 4, right: 12, top: 12 }}>
            {grid}
            <XAxis
              axisLine={false}
              dataKey='label'
              minTickGap={32}
              tickFormatter={(value: string) => clip(value, 12)}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tickFormatter={valueTick}
              tickLine={false}
              width={52}
            />
            {tooltip}
            {legend}
            {series.map((_, index) =>
              view.chart === "line" ? (
                <Line
                  connectNulls
                  dataKey={seriesKey(index)}
                  dot={plot.length <= 30}
                  key={seriesKey(index)}
                  stroke={`var(--color-${seriesKey(index)})`}
                  strokeWidth={2}
                  type={curve}>
                  {view.showLabels && (
                    <LabelList
                      className='fill-muted-foreground'
                      dataKey={seriesKey(index)}
                      fontSize={10}
                      formatter={(value: number) =>
                        formatValue(value, series[index])
                      }
                      position='top'
                    />
                  )}
                </Line>
              ) : (
                <Area
                  connectNulls
                  dataKey={seriesKey(index)}
                  fill={`var(--color-${seriesKey(index)})`}
                  fillOpacity={0.15}
                  key={seriesKey(index)}
                  stroke={`var(--color-${seriesKey(index)})`}
                  strokeWidth={2}
                  type={curve}
                />
              ),
            )}
          </Chart>
        </ChartContainer>
      );
    }
    case "bar":
    case "stackedBar":
      return (
        <ChartContainer className='aspect-auto h-full w-full' config={config}>
          <BarChart data={plot} margin={{ left: 4, right: 12, top: 16 }}>
            {grid}
            <XAxis
              axisLine={false}
              dataKey='label'
              minTickGap={8}
              tickFormatter={(value: string) => clip(value, 10)}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tickFormatter={valueTick}
              tickLine={false}
              width={52}
            />
            {tooltip}
            {legend}
            {series.map((_, index) => (
              <Bar
                dataKey={seriesKey(index)}
                fill={`var(--color-${seriesKey(index)})`}
                key={seriesKey(index)}
                maxBarSize={36}
                radius={
                  view.chart === "stackedBar" && index < series.length - 1
                    ? 0
                    : [4, 4, 0, 0]
                }
                stackId={view.chart === "stackedBar" ? "stack" : undefined}>
                {view.showLabels && (
                  <LabelList
                    className='fill-muted-foreground'
                    dataKey={seriesKey(index)}
                    fontSize={10}
                    formatter={(value: number) =>
                      formatValue(value, series[index])
                    }
                    position={view.chart === "stackedBar" ? "inside" : "top"}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      );
    case "barHorizontal": {
      // A signed single series reads best coloured by direction.
      const signed =
        series.length === 1 && series[0].format === "signedPercent";
      return (
        <ChartContainer className='aspect-auto h-full w-full' config={config}>
          <BarChart
            data={plot}
            layout='vertical'
            margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
            {view.showGrid && (
              <CartesianGrid
                horizontal={false}
                stroke='hsl(var(--chart-grid))'
              />
            )}
            <XAxis
              axisLine={false}
              tickFormatter={valueTick}
              tickLine={false}
              type='number'
            />
            <YAxis
              axisLine={false}
              dataKey='label'
              interval={0}
              tickFormatter={(value: string) => clip(value)}
              tickLine={false}
              type='category'
              width={120}
            />
            {tooltip}
            {legend}
            {series.map((_, index) => (
              <Bar
                dataKey={seriesKey(index)}
                fill={`var(--color-${seriesKey(index)})`}
                key={seriesKey(index)}
                maxBarSize={22}
                radius={4}>
                {signed &&
                  plot.map((point) => (
                    <Cell
                      fill={
                        Number(point.s0 ?? 0) >= 0
                          ? "var(--viz-positive)"
                          : "var(--viz-negative)"
                      }
                      key={point.label}
                    />
                  ))}
                {view.showLabels && (
                  <LabelList
                    className='fill-muted-foreground'
                    dataKey={seriesKey(index)}
                    fontSize={10}
                    formatter={(value: number) =>
                      formatValue(value, series[index])
                    }
                    position='right'
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      );
    }
    case "pie":
    case "donut": {
      const field = series[0];
      const sliceCount = view.limit ?? PIE_SLICES;
      const sorted = [...plot].sort(
        (a, b) => Number(b.s0 ?? 0) - Number(a.s0 ?? 0),
      );
      const slices = sorted.slice(0, sliceCount);
      const rest = sorted
        .slice(sliceCount)
        .reduce((total, point) => total + Number(point.s0 ?? 0), 0);
      const data =
        rest > 0 ? [...slices, { label: "…", row: {}, s0: rest }] : slices;
      return (
        <div className='flex h-full min-h-0 flex-col'>
          <ChartContainer
            className='aspect-auto min-h-0 w-full flex-1'
            config={{}}>
            <PieChart>
              <ChartTooltip
                content={
                  <SeriesTooltip
                    fieldLabel={fieldLabel}
                    formatValue={formatValue}
                    series={series}
                  />
                }
              />
              <Pie
                data={data}
                dataKey='s0'
                innerRadius={view.chart === "donut" ? "55%" : 0}
                label={
                  view.showLabels
                    ? (entry: { value: number }) =>
                        formatValue(entry.value, field)
                    : false
                }
                nameKey='label'
                outerRadius='80%'
                paddingAngle={view.chart === "donut" ? 2 : 0}
                strokeWidth={1}>
                {data.map((point, index) => (
                  <Cell fill={seriesColor(view, index)} key={point.label} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          {view.showLegend && (
            <ul className='flex shrink-0 flex-wrap justify-center gap-x-3 gap-y-1 pt-2 text-muted-foreground text-xs'>
              {data.map((point, index) => (
                <li className='flex items-center gap-1.5' key={point.label}>
                  <span
                    className='h-2 w-2 shrink-0 rounded-[2px]'
                    style={{ backgroundColor: seriesColor(view, index) }}
                  />
                  {clip(point.label)}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "radar":
      return (
        <ChartContainer className='aspect-auto h-full w-full' config={config}>
          <RadarChart data={plot} outerRadius='70%'>
            {view.showGrid && <PolarGrid stroke='hsl(var(--chart-grid))' />}
            <PolarAngleAxis
              dataKey='label'
              tick={{ fontSize: 10 }}
              tickFormatter={(value: string) => clip(value, 12)}
            />
            <PolarRadiusAxis axisLine={false} tick={false} />
            {tooltip}
            {legend}
            {series.map((_, index) => (
              <Radar
                dataKey={seriesKey(index)}
                fill={`var(--color-${seriesKey(index)})`}
                fillOpacity={0.2}
                key={seriesKey(index)}
                stroke={`var(--color-${seriesKey(index)})`}
              />
            ))}
          </RadarChart>
        </ChartContainer>
      );
    case "scatter":
      return (
        <ChartContainer className='aspect-auto h-full w-full' config={config}>
          <ScatterChart margin={{ left: 4, right: 16, top: 12, bottom: 4 }}>
            {grid}
            <XAxis
              axisLine={false}
              dataKey='s0'
              name={fieldLabel(series[0])}
              tickFormatter={(value: number) => formatValue(value, series[0])}
              tickLine={false}
              type='number'
            />
            <YAxis
              axisLine={false}
              dataKey='s1'
              name={fieldLabel(series[1])}
              tickFormatter={(value: number) => formatValue(value, series[1])}
              tickLine={false}
              type='number'
              width={52}
            />
            {series[2] && <ZAxis dataKey='s2' range={[40, 400]} />}
            <ChartTooltip
              content={
                <SeriesTooltip
                  fieldLabel={fieldLabel}
                  formatValue={formatValue}
                  series={series}
                />
              }
              cursor={{ strokeDasharray: "3 3" }}
            />
            <Scatter data={plot} fill='var(--color-s0)' fillOpacity={0.7} />
          </ScatterChart>
        </ChartContainer>
      );
  }
};
