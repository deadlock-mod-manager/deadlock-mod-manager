import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import type { BracketMetric, BracketRow } from "@/lib/stats/benchmark";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";

const formatBracketValue = (metric: BracketMetric, value: number): string => {
  switch (metric) {
    case "accuracy":
      return formatPercent(value, 0);
    case "kda":
    case "deaths":
      return formatDecimal(value, 1);
    default:
      return formatCompact(value);
  }
};

/** Position on the ruler, which spans the bracket's 5th to 95th percentile. */
const at = (row: BracketRow, value: number) => {
  const span = row.high - row.low;
  const ratio = span > 0 ? (value - row.low) / span : 0.5;
  return `${Math.min(1, Math.max(0, ratio)) * 100}%`;
};

const Ruler = ({ row }: { row: BracketRow }) => {
  const good = row.beats >= 0.5;
  const color = good ? WIN_COLOR : LOSS_COLOR;
  const mine = at(row, row.mine);
  const median = at(row, row.median);
  const [from, to] = row.mine >= row.median ? [median, mine] : [mine, median];

  return (
    <div aria-hidden className='relative h-6 min-w-0 flex-1'>
      <div className='absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-foreground/[0.06]' />
      <div
        className='absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-foreground/[0.11]'
        style={{
          left: at(row, row.q1),
          right: `calc(100% - ${at(row, row.q3)})`,
        }}
      />
      <div
        className='absolute top-1/2 h-0.5 -translate-y-1/2'
        style={{
          left: from,
          right: `calc(100% - ${to})`,
          backgroundColor: tint(color, 60),
        }}
      />
      <div
        className='absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/50'
        style={{ left: median }}
      />
      <div
        className='absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full'
        style={{ left: mine, backgroundColor: tint(color, 18) }}
      />
      <div
        className='absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card'
        style={{ left: mine, backgroundColor: color }}
      />
    </div>
  );
};

interface RankBenchmarkProps {
  rows: BracketRow[];
  /** Name of the tier the player is compared with, `null` for everyone. */
  bracketName: string | null;
  isPending: boolean;
  isError: boolean;
}

/**
 * The player's per-match averages placed inside their own rank: the ruler is
 * the bracket from its 5th to its 95th percentile, the bar its middle half.
 */
export const RankBenchmark = ({
  rows,
  bracketName,
  isPending,
  isError,
}: RankBenchmarkProps) => {
  const { t } = useTranslation();

  const legend = (
    <div className='flex shrink-0 items-center gap-4 text-[11px] text-muted-foreground'>
      <span className='flex items-center gap-1.5'>
        <span className='h-1.5 w-4 rounded-full bg-foreground/[0.11]' />
        {t("stats.bracket.middleHalf")}
      </span>
      <span className='flex items-center gap-1.5'>
        <span className='h-2.5 w-0.5 rounded-full bg-primary/50' />
        {t("stats.bracket.median")}
      </span>
    </div>
  );

  const body = (() => {
    if (isPending) {
      return (
        <div className='flex flex-col gap-4 pt-2'>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className='h-8 w-full' key={index} />
          ))}
        </div>
      );
    }
    if (isError || rows.length === 0) {
      return (
        <p className='py-10 text-center text-muted-foreground text-sm'>
          {t(isError ? "stats.bracket.error" : "stats.bracket.empty")}
        </p>
      );
    }
    return (
      <div className='flex flex-col'>
        {rows.map((row) => {
          const good = row.beats >= 0.5;
          const share = Math.max(
            1,
            Math.round((good ? 1 - row.beats : row.beats) * 100),
          );
          return (
            <div
              className='flex items-center gap-4 border-border/50 border-t py-2.5 first:border-t-0'
              key={row.metric}>
              <div className='flex w-32 shrink-0 flex-col gap-0.5'>
                <span className='font-medium text-[13px]'>
                  {t(`stats.bracket.metrics.${row.metric}`)}
                </span>
                <span className='font-mono text-[11px] text-muted-foreground/80'>
                  {t("stats.bracket.medianValue", {
                    value: formatBracketValue(row.metric, row.median),
                  })}
                </span>
              </div>
              <span className='w-16 shrink-0 text-right font-mono font-semibold text-base tabular-nums'>
                {formatBracketValue(row.metric, row.mine)}
              </span>
              <Ruler row={row} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className='min-w-20 shrink-0 cursor-default whitespace-nowrap rounded-full px-2 py-0.5 text-center font-mono font-semibold text-[11.5px]'
                    style={{
                      color: good ? WIN_COLOR : LOSS_COLOR,
                      backgroundColor: tint(good ? WIN_COLOR : LOSS_COLOR, 10),
                    }}>
                    {t(good ? "stats.bracket.top" : "stats.bracket.bottom", {
                      percent: share,
                    })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {t(
                    row.higherIsBetter
                      ? "stats.bracket.beatsHint"
                      : "stats.bracket.beatsHintLower",
                    { percent: Math.round(row.beats * 100) },
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    );
  })();

  return (
    <ChartCard
      action={legend}
      description={
        bracketName
          ? t("stats.bracket.description", { rank: bracketName })
          : t("stats.bracket.descriptionGlobal")
      }
      title={t("stats.bracket.title")}>
      {body}
    </ChartCard>
  );
};
