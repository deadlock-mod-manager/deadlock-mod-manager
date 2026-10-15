import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@deadlock-mods/ui/components/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deadlock-mods/ui/components/table";
import { ArrowDown, ArrowUp } from "@deadlock-mods/ui/icons";
import { useMemo, useState } from "react";
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
  RadialBar,
  RadialBarChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import {
  type CellValue,
  type Dataset,
  type DatasetField,
  type DatasetRow,
  fieldByKey,
  numericValue,
} from "@/lib/stats/dashboard/dataset";
import type { WidgetView } from "@/lib/stats/dashboard/layout";
import {
  compareCells,
  hasTimeAxis,
  prepareRows,
  reduceColumn,
} from "@/lib/stats/dashboard/prepare";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./dashboard-context";
import { useFieldFormat } from "./use-field-format";

/** Two validated series colours first, then the theme's chart tokens. */
export const SERIES_COLORS = [
  "var(--viz-series-1)",
  "var(--viz-series-2)",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-1))",
  "hsl(var(--primary))",
] as const;

const PIE_SLICES = 8;
const LABEL_CHARS = 18;

const seriesColor = (view: WidgetView, index: number) =>
  SERIES_COLORS[(view.color + index) % SERIES_COLORS.length];

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
  const label = payload[0]?.payload?.label;
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
        series.length === 1 && series[0]?.format === "signedPercent";
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

interface SingleValueProps {
  dataset: Dataset;
  rows: DatasetRow[];
  series: DatasetField[];
  view: WidgetView;
}

const KpiView = ({ dataset, rows, series, view }: SingleValueProps) => {
  const { fieldLabel, formatValue } = useFieldFormat(dataset);
  const timeAxis = hasTimeAxis(dataset, view);
  const sparkline =
    rows.length > 2 && view.x !== ""
      ? rows.map((row) => ({ v: numericValue(row[series[0]?.key ?? ""]) }))
      : null;

  return (
    <div className='flex h-full min-h-0 flex-col justify-center gap-2'>
      <div className='flex flex-wrap items-end gap-x-6 gap-y-2'>
        {series.map((field, index) => (
          <div className='flex min-w-0 flex-col' key={field.key}>
            {series.length > 1 && (
              <span className='truncate text-muted-foreground text-xs'>
                {fieldLabel(field)}
              </span>
            )}
            <span
              className={cn(
                "font-semibold leading-none tabular-nums",
                index === 0 ? "text-3xl" : "text-xl text-muted-foreground",
              )}>
              {formatValue(
                reduceColumn(rows, field.key, view.reduce, timeAxis),
                field,
              )}
            </span>
          </div>
        ))}
      </div>
      {sparkline && (
        <div className='h-10 min-h-0 w-full flex-1'>
          <ChartContainer
            className='aspect-auto h-full w-full'
            config={{ v: { color: seriesColor(view, 0) } }}>
            <AreaChart data={sparkline} margin={{ top: 2, bottom: 2 }}>
              <Area
                connectNulls
                dataKey='v'
                fill='var(--color-v)'
                fillOpacity={0.15}
                isAnimationActive={false}
                stroke='var(--color-v)'
                strokeWidth={1.5}
                type='monotone'
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
};

const RadialView = ({ dataset, rows, series, view }: SingleValueProps) => {
  const { formatValue } = useFieldFormat(dataset);
  const field = series[0];
  const value = field
    ? reduceColumn(rows, field.key, view.reduce, hasTimeAxis(dataset, view))
    : null;
  const isFraction =
    field?.format === "percent" || field?.format === "signedPercent";
  const max = isFraction
    ? 1
    : Math.max(
        ...rows.map((row) => numericValue(row[field?.key ?? ""]) ?? 0),
        value ?? 0,
        1,
      );
  const share = Math.min(Math.max((value ?? 0) / max, 0), 1);

  return (
    <div className='relative h-full min-h-0 w-full'>
      <ChartContainer
        className='aspect-auto h-full w-full'
        config={{ value: { color: seriesColor(view, 0) } }}>
        <RadialBarChart
          data={[{ value: share * 100 }]}
          endAngle={-270}
          innerRadius='72%'
          outerRadius='100%'
          startAngle={90}>
          <PolarRadiusAxis axisLine={false} domain={[0, 100]} tick={false} />
          <RadialBar
            background={{ fill: "hsl(var(--muted))" }}
            cornerRadius={8}
            dataKey='value'
            fill='var(--color-value)'
          />
        </RadialBarChart>
      </ChartContainer>
      <span className='pointer-events-none absolute inset-0 flex items-center justify-center font-semibold text-2xl tabular-nums'>
        {formatValue(value, field)}
      </span>
    </div>
  );
};

const TableView = ({
  dataset,
  rows,
  view,
}: {
  dataset: Dataset;
  rows: DatasetRow[];
  view: WidgetView;
}) => {
  const { fieldLabel, formatValue } = useFieldFormat(dataset);
  const { heroesById } = useDashboardData();
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);

  const columns = useMemo(() => {
    const keys = view.y.length > 0 ? [view.x, ...view.y] : [];
    const picked = keys.flatMap((key) => {
      const field = fieldByKey(dataset, key);
      return field ? [field] : [];
    });
    return picked.length > 0 ? picked : dataset.fields;
  }, [dataset, view.x, view.y]);

  const sorted = useMemo(() => {
    if (!sort) {
      return rows;
    }
    const direction = sort.asc ? 1 : -1;
    return [...rows].sort(
      (a, b) => direction * compareCells(a[sort.key], b[sort.key]),
    );
  }, [rows, sort]);

  return (
    <div className='h-full min-h-0 overflow-auto'>
      <Table>
        <TableHeader className='sticky top-0 bg-card'>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead
                aria-sort={
                  sort?.key === column.key
                    ? sort.asc
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className={cn(index > 0 && "text-right")}
                key={column.key}>
                <button
                  className={cn(
                    "inline-flex items-center gap-1",
                    index > 0 && "w-full justify-end",
                  )}
                  onClick={() =>
                    setSort((current) => ({
                      key: column.key,
                      asc: current?.key === column.key ? !current.asc : false,
                    }))
                  }
                  type='button'>
                  {fieldLabel(column)}
                  {sort?.key === column.key &&
                    (sort.asc ? (
                      <ArrowUp className='h-3 w-3' />
                    ) : (
                      <ArrowDown className='h-3 w-3' />
                    ))}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={JSON.stringify(row)}>
              {columns.map((column, index) => {
                const value = row[column.key];
                const heroId =
                  column.format === "hero" ? numericValue(value) : null;
                return (
                  <TableCell
                    className={cn(
                      "py-1.5",
                      index > 0 && "text-right tabular-nums",
                    )}
                    key={column.key}>
                    {heroId !== null ? (
                      <span className='flex items-center gap-2'>
                        <HeroAvatar
                          className='h-6 w-6'
                          hero={heroesById.get(heroId)}
                          heroId={heroId}
                        />
                        {formatValue(value, column)}
                      </span>
                    ) : (
                      formatValue(value, column)
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
