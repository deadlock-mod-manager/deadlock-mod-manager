import { Info, Loader2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import {
  GRADE_STYLES,
  GradePill,
  LivePanel,
} from "@/components/stats/live-parts";
import { formatDecimal, formatWhole } from "@/lib/stats/format";
import {
  GRADE_STARTS,
  GRADES,
  type LiveGradeRow,
  type LiveMetric,
} from "@/lib/stats/live-grades";
import { cn } from "@/lib/utils";

export type LivePaceNotice =
  | "unknownHero"
  | "firstMinute"
  | "loading"
  | "unavailable";

interface LivePaceProps {
  rows: LiveGradeRow[];
  notice: LivePaceNotice | null;
  /** "Ritualist Haze", or just the hero when graded against everyone. */
  peers: string;
  clock: string | null;
  minutes: number | null;
}

const PER_MINUTE = new Set<LiveMetric>([
  "soulsPerMin",
  "objectiveDamagePerMin",
]);

const formatValue = (metric: LiveMetric, value: number) =>
  PER_MINUTE.has(metric) ? formatWhole(value) : value.toFixed(0);

const formatAverage = (metric: LiveMetric, value: number) =>
  PER_MINUTE.has(metric) ? formatWhole(value) : formatDecimal(value, 1);

const Ruler = ({ row }: { row: LiveGradeRow }) => {
  const style = GRADE_STYLES[row.grade];
  return (
    <div aria-hidden className='relative h-6 w-[330px] shrink-0'>
      <div className='absolute inset-x-0 top-1/2 flex h-1.5 -translate-y-1/2 gap-0.5'>
        {GRADES.map((grade, index) => (
          <span
            className={cn(
              "h-full rounded-full",
              grade === row.grade ? style.zone : "bg-foreground/[0.07]",
            )}
            key={grade}
            style={{
              width: `${((GRADE_STARTS[index + 1] ?? 1) - GRADE_STARTS[index]) * 100}%`,
            }}
          />
        ))}
      </div>
      {/* The bracket average is where half the bracket is beaten. */}
      <div className='absolute top-1/2 left-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-[1px] bg-primary/50' />
      <div
        className={cn(
          "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50",
          style.zone,
        )}
        style={{ left: `${row.beats * 100}%` }}
      />
      <div
        className={cn(
          "absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current shadow-[0_0_0_2px_hsl(var(--background))]",
          style.text,
        )}
        style={{ left: `${row.beats * 100}%` }}
      />
    </div>
  );
};

/**
 * The local player's match so far, graded against players on the same hero in
 * their rank bracket at the same minute.
 */
export const LivePace = ({
  rows,
  notice,
  peers,
  clock,
  minutes,
}: LivePaceProps) => {
  const { t } = useTranslation();

  const detail = (row: LiveGradeRow) => {
    if (row.metric === "deaths") return t("stats.live.pace.fewerIsBetter");
    if (PER_MINUTE.has(row.metric) && minutes) {
      return t("stats.live.pace.soFarTotal", {
        value: formatWhole(row.value * minutes),
      });
    }
    return t("stats.live.pace.soFar");
  };

  const legend = (
    <div className='flex shrink-0 gap-1'>
      {GRADES.map((grade) => (
        <GradePill
          className='h-[18px] w-[22px] text-[10.5px]'
          grade={grade}
          key={grade}
        />
      ))}
    </div>
  );

  return (
    <LivePanel
      action={legend}
      description={t("stats.live.pace.description", {
        peers,
        clock: clock ?? "",
      })}
      title={t("stats.live.pace.title")}>
      {notice ? (
        <div className='flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm'>
          {notice === "loading" && <Loader2 className='h-4 w-4 animate-spin' />}
          {t(`stats.live.performance.${notice}`)}
        </div>
      ) : (
        <div className='flex flex-col gap-1 pt-4'>
          {rows.map((row, index) => (
            <div
              className={cn(
                "flex items-center gap-4 py-2.5",
                // A hairline that takes no height, so rows keep their pitch.
                index > 0 &&
                  "shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]",
              )}
              key={row.metric}>
              <div className='flex w-[150px] shrink-0 flex-col gap-0.5'>
                <span className='font-semibold text-[13px] leading-[17px]'>
                  {t(`stats.live.performance.metrics.${row.metric}`)}
                </span>
                <span className='font-mono text-[11px] text-muted-foreground/75 leading-[14px]'>
                  {detail(row)}
                </span>
              </div>
              <span className='w-[70px] shrink-0 text-right font-bold font-mono text-base leading-[21px] tabular-nums'>
                {formatValue(row.metric, row.value)}
              </span>
              <Ruler row={row} />
              <span className='min-w-0 flex-1 font-mono text-[11.5px] text-muted-foreground/75 tabular-nums'>
                {t("stats.live.pace.average", {
                  value: formatAverage(row.metric, row.average),
                })}
              </span>
              <GradePill grade={row.grade} />
            </div>
          ))}
          <span className='flex items-center gap-2 pt-2.5 text-[11.5px] text-muted-foreground leading-[15px]'>
            <Info className='h-[13px] w-[13px] shrink-0' />
            {t("stats.live.pace.footnote")}
          </span>
        </div>
      )}
    </LivePanel>
  );
};
