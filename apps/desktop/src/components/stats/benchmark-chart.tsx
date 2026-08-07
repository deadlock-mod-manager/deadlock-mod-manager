import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { DeltaBarChart } from "@/components/stats/delta-bar-chart";
import type { BenchmarkMetric } from "@/lib/stats/derive";
import { formatCompact } from "@/lib/stats/format";

interface BenchmarkChartProps {
  heroName: string;
  metrics: BenchmarkMetric[];
}

/**
 * Diverging bars: how far the player sits from the global average on one hero.
 * The sign is not enough on its own - deaths above average is a bad thing - so
 * the colour follows "is this an improvement", and the label spells out both values.
 */
export const BenchmarkChart = ({ heroName, metrics }: BenchmarkChartProps) => {
  const { t } = useTranslation();

  const bars = useMemo(
    () =>
      metrics.map((metric) => ({
        id: metric.metric,
        label: t(`stats.metrics.${metric.metric}`),
        // Extreme outliers would flatten every other bar.
        delta: Math.max(-100, Math.min(100, metric.deltaPct * 100)),
        rawDelta: metric.deltaPct,
        isPositive:
          metric.deltaPct === 0 ||
          metric.deltaPct > 0 === metric.higherIsBetter,
        tooltip: t("stats.charts.benchmarkTooltip", {
          mine: formatCompact(metric.mine),
          global: formatCompact(metric.global),
        }),
      })),
    [metrics, t],
  );

  if (bars.length === 0) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.charts.benchmarkDescription", { hero: heroName })}
      title={t("stats.charts.benchmarkTitle")}>
      <DeltaBarChart
        bars={bars}
        domain={[-100, 100]}
        height={300}
        labelWidth={100}
        seriesLabel={t("stats.charts.benchmarkDelta")}
      />
    </ChartCard>
  );
};
