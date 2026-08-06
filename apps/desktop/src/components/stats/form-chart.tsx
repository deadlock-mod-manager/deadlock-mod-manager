import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { WinrateAreaChart } from "@/components/stats/winrate-area-chart";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { formCurve } from "@/lib/stats/derive";

const WINDOW = 20;

interface FormChartProps {
  matches: MatchHistoryEntry[];
}

export const FormChart = ({ matches }: FormChartProps) => {
  const { t } = useTranslation();

  const data = useMemo(() => formCurve(matches, WINDOW), [matches]);

  if (data.length === 0) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.charts.formDescription", { window: WINDOW })}
      title={t("stats.charts.formTitle")}>
      <WinrateAreaChart data={data} heightPx={260} />
    </ChartCard>
  );
};
