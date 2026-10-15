import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  ArrowDown,
  ArrowUp,
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartColumnStacked,
  ChartLine,
  ChartPie,
  ChartScatter,
  Donut,
  Gauge,
  Hash,
  Radar,
  Table2,
} from "@deadlock-mods/ui/icons";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  type Dataset,
  isCategoryField,
  isNumericField,
} from "@/lib/stats/dashboard/dataset";
import {
  CHART_TYPES,
  type ChartType,
  KPI_REDUCERS,
  type WidgetView,
} from "@/lib/stats/dashboard/layout";
import {
  adaptView,
  needsCategory,
  seriesLimit,
  supportsChart,
} from "@/lib/stats/dashboard/suggest";
import { cn } from "@/lib/utils";
import { useFieldFormat } from "./use-field-format";
import { SERIES_COLORS } from "./widget-chart";

const CHART_ICONS = {
  kpi: Hash,
  line: ChartLine,
  area: ChartArea,
  bar: ChartColumn,
  barHorizontal: ChartBar,
  stackedBar: ChartColumnStacked,
  pie: ChartPie,
  donut: Donut,
  radar: Radar,
  scatter: ChartScatter,
  radial: Gauge,
  table: Table2,
} satisfies Record<ChartType, ComponentType<{ className?: string }>>;

const LIMITS = [5, 10, 15, 20, 30, 50, 100] as const;
const NONE = "__none";

export const OptionRow = ({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    <Label className='text-muted-foreground text-xs'>{label}</Label>
    {children}
  </div>
);

interface ViewOptionsProps {
  dataset: Dataset;
  view: WidgetView;
  onChange: (view: WidgetView) => void;
}

export const ViewOptions = ({ dataset, view, onChange }: ViewOptionsProps) => {
  const { t } = useTranslation();
  const { fieldLabel } = useFieldFormat(dataset);
  const patch = (next: Partial<WidgetView>) => onChange({ ...view, ...next });

  // Labels first, but any field can be the axis (match progress, a timestamp).
  const categories = [
    ...dataset.fields.filter(isCategoryField),
    ...dataset.fields.filter((field) => !isCategoryField(field)),
  ];
  const values = dataset.fields.filter(
    (field) => isNumericField(field) && !isCategoryField(field),
  );
  const maxSeries = seriesLimit(view.chart);
  const singleValue = view.chart === "kpi" || view.chart === "radial";

  const toggleSeries = (key: string) => {
    if (view.y.includes(key)) {
      if (view.y.length > 1) {
        patch({ y: view.y.filter((entry) => entry !== key) });
      }
      return;
    }
    // At the limit the newest pick replaces the oldest, so clicking always does
    // something visible.
    patch({ y: [...view.y, key].slice(-maxSeries) });
  };

  return (
    <div className='flex flex-col gap-4'>
      <OptionRow label={t("stats.dashboard.editor.chartType")}>
        <div className='grid grid-cols-4 gap-1.5'>
          {CHART_TYPES.map((chart) => {
            const Icon = CHART_ICONS[chart];
            const supported = supportsChart(dataset, chart);
            return (
              <button
                aria-pressed={view.chart === chart}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[11px] transition-colors",
                  view.chart === chart
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-accent",
                  !supported && "cursor-not-allowed opacity-40",
                )}
                disabled={!supported}
                key={chart}
                onClick={() => onChange(adaptView(view, dataset, chart))}
                title={
                  supported
                    ? undefined
                    : t("stats.dashboard.editor.chartUnsupported")
                }
                type='button'>
                <Icon className='h-4 w-4' />
                <span className='truncate'>
                  {t(`stats.dashboard.charts.${chart}`)}
                </span>
              </button>
            );
          })}
        </div>
      </OptionRow>

      {(needsCategory(view.chart) ||
        view.chart === "scatter" ||
        view.chart === "table" ||
        view.chart === "kpi") &&
        categories.length > 0 && (
          <OptionRow
            label={t(
              view.chart === "scatter"
                ? "stats.dashboard.editor.pointLabel"
                : "stats.dashboard.editor.category",
            )}>
            <Select
              onValueChange={(value) =>
                patch({ x: value === NONE ? "" : value })
              }
              value={view.x || NONE}>
              <SelectTrigger className='h-9'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!needsCategory(view.chart) && (
                  <SelectItem value={NONE}>
                    {t("stats.dashboard.editor.none")}
                  </SelectItem>
                )}
                {categories.map((field) => (
                  <SelectItem key={field.key} value={field.key}>
                    {fieldLabel(field)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OptionRow>
        )}

      <OptionRow
        label={t(
          view.chart === "scatter"
            ? "stats.dashboard.editor.scatterValues"
            : singleValue || maxSeries === 1
              ? "stats.dashboard.editor.value"
              : "stats.dashboard.editor.values",
          { count: maxSeries },
        )}>
        <div className='flex flex-wrap gap-1.5'>
          {values.map((field) => {
            const index = view.y.indexOf(field.key);
            const active = index >= 0;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
                key={field.key}
                onClick={() =>
                  maxSeries === 1
                    ? patch({ y: [field.key] })
                    : toggleSeries(field.key)
                }
                type='button'>
                {active && (
                  <span
                    className='h-2 w-2 rounded-full'
                    style={{
                      backgroundColor:
                        SERIES_COLORS[
                          (view.color + index) % SERIES_COLORS.length
                        ],
                    }}
                  />
                )}
                {fieldLabel(field)}
              </button>
            );
          })}
        </div>
      </OptionRow>

      {singleValue && (
        <OptionRow label={t("stats.dashboard.editor.reduce")}>
          <Select
            onValueChange={(value) =>
              patch({
                reduce:
                  KPI_REDUCERS.find((reducer) => reducer === value) ?? "auto",
              })
            }
            value={view.reduce}>
            <SelectTrigger className='h-9'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KPI_REDUCERS.map((reducer) => (
                <SelectItem key={reducer} value={reducer}>
                  {t(`stats.dashboard.reducers.${reducer}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OptionRow>
      )}

      {dataset.rows.length > 1 && (
        <div className='grid grid-cols-[1fr_auto_1fr] items-end gap-2'>
          <OptionRow label={t("stats.dashboard.editor.sortBy")}>
            <Select
              onValueChange={(value) =>
                patch({ sortBy: value === NONE ? "" : value })
              }
              value={view.sortBy || NONE}>
              <SelectTrigger className='h-9'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {t("stats.dashboard.editor.sortNone")}
                </SelectItem>
                {dataset.fields.map((field) => (
                  <SelectItem key={field.key} value={field.key}>
                    {fieldLabel(field)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OptionRow>
          <button
            aria-label={t(
              view.sortDirection === "asc"
                ? "stats.dashboard.editor.ascending"
                : "stats.dashboard.editor.descending",
            )}
            className='flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent disabled:opacity-40'
            disabled={!view.sortBy}
            onClick={() =>
              patch({
                sortDirection: view.sortDirection === "asc" ? "desc" : "asc",
              })
            }
            title={t(
              view.sortDirection === "asc"
                ? "stats.dashboard.editor.ascending"
                : "stats.dashboard.editor.descending",
            )}
            type='button'>
            {view.sortDirection === "asc" ? (
              <ArrowUp className='h-4 w-4' />
            ) : (
              <ArrowDown className='h-4 w-4' />
            )}
          </button>
          <OptionRow label={t("stats.dashboard.editor.limit")}>
            <Select
              onValueChange={(value) =>
                patch({ limit: value === NONE ? null : Number(value) })
              }
              value={view.limit === null ? NONE : String(view.limit)}>
              <SelectTrigger className='h-9'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {t("stats.dashboard.editor.limitAll")}
                </SelectItem>
                {LIMITS.map((limit) => (
                  <SelectItem key={limit} value={String(limit)}>
                    {t("stats.dashboard.editor.limitTop", { count: limit })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OptionRow>
        </div>
      )}

      {view.chart !== "table" && (
        <OptionRow label={t("stats.dashboard.editor.color")}>
          <div className='flex gap-1.5'>
            {SERIES_COLORS.map((color, index) => (
              <button
                aria-label={t("stats.dashboard.editor.colorOption", {
                  index: index + 1,
                })}
                aria-pressed={view.color === index}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-transform",
                  view.color === index
                    ? "scale-110 border-foreground"
                    : "border-transparent",
                )}
                key={color}
                onClick={() => patch({ color: index })}
                style={{ backgroundColor: color }}
                type='button'
              />
            ))}
          </div>
        </OptionRow>
      )}

      {!singleValue && view.chart !== "table" && (
        <div className='grid grid-cols-2 gap-x-4 gap-y-2'>
          {(
            [
              ["showLabels", view.showLabels],
              ["showGrid", view.showGrid],
              ["showLegend", view.showLegend],
              ["smooth", view.smooth],
            ] as const
          ).map(([key, checked]) => (
            <label
              className='flex items-center justify-between gap-2 text-sm'
              key={key}>
              {t(`stats.dashboard.editor.${key}`)}
              <Switch
                checked={checked}
                onCheckedChange={(next) => patch({ [key]: next })}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
