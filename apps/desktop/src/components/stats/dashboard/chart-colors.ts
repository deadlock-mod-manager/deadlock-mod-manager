import type { WidgetView } from "@/lib/stats/dashboard/layout";

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

export const seriesColor = (view: WidgetView, index: number) =>
  SERIES_COLORS[(view.color + index) % SERIES_COLORS.length];
