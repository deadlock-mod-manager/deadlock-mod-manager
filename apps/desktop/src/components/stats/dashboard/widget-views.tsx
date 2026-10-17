import { ChartContainer } from "@deadlock-mods/ui/components/chart";
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
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import {
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
  reduceColumn,
} from "@/lib/stats/dashboard/prepare";
import { cn } from "@/lib/utils";
import { seriesColor } from "./chart-colors";
import { useDashboardData } from "./dashboard-context";
import { useFieldFormat } from "./use-field-format";

/** The views that show values rather than plot them: a number, a gauge, a table. */

interface SingleValueProps {
  dataset: Dataset;
  rows: DatasetRow[];
  series: DatasetField[];
  view: WidgetView;
}

export const KpiView = ({ dataset, rows, series, view }: SingleValueProps) => {
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

export const RadialView = ({
  dataset,
  rows,
  series,
  view,
}: SingleValueProps) => {
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

export const TableView = ({
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
