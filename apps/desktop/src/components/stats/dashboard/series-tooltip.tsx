import {
  type CellValue,
  type DatasetField,
  type DatasetRow,
  numericValue,
} from "@/lib/stats/dashboard/dataset";

export interface PlotRow {
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

export const SeriesTooltip = ({
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
        const raw = Array.isArray(entry.value)
          ? null
          : numericValue(entry.value);
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
