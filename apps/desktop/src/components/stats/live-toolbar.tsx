import { Copy, PlugZap } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { WIN_COLOR } from "@/components/stats/chart-fx";
import { useLiveHeadline } from "@/hooks/use-live-match";

/**
 * When the bridge last reported. Console log timestamps are local time without
 * a year (`MM/DD HH:MM:SS`).
 */
export const reportedAt = (
  updatedAt: string | null,
  now: number,
): number | null => {
  const parts = updatedAt?.match(/^(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)$/);
  if (!parts) return null;
  const [, month, day, hours, minutes, seconds] = parts.map(Number);
  const reported = new Date(
    new Date(now).getFullYear(),
    month - 1,
    day,
    hours,
    minutes,
    seconds,
  );
  // A report from late December read on January 1st belongs to last year.
  if (reported.getTime() - now > 24 * 60 * 60 * 1000) {
    reported.setFullYear(reported.getFullYear() - 1);
  }
  return reported.getTime();
};

/**
 * The Live tab's side of the Stats page's tab row: where the board comes from,
 * how fresh it is, and which match it is. The page's filters don't apply here.
 */
export const LiveToolbar = () => {
  const { t } = useTranslation();
  const headline = useLiveHeadline();
  if (!headline) return null;

  const now = Date.now();
  const reported = reportedAt(headline.updatedAt, now);
  const { matchId } = headline;
  return (
    <div className='flex flex-wrap items-center gap-2.5 text-xs'>
      <span className='stats-surface flex h-[30px] items-center gap-[7px] rounded-lg border px-2.5'>
        <PlugZap className='h-[13px] w-[13px]' style={{ color: WIN_COLOR }} />
        <span className='font-medium'>
          {headline.source === "versusScreen"
            ? t("stats.live.status.versusScreen")
            : t("stats.live.status.connected")}
        </span>
        {reported !== null && (
          <span className='text-muted-foreground'>
            {t("stats.live.status.updated", {
              count: Math.max(0, Math.round((now - reported) / 1000)),
            })}
          </span>
        )}
      </span>
      {matchId && (
        <button
          className='stats-surface flex h-[30px] items-center gap-[7px] rounded-lg border px-2.5 text-muted-foreground transition-colors hover:text-foreground'
          onClick={() => navigator.clipboard.writeText(matchId)}
          title={t("stats.live.status.copy")}
          type='button'>
          {t("stats.live.status.match")}
          <span className='font-mono text-foreground'>
            {`#${matchId.replace(/\B(?=(\d{3})+$)/g, " ")}`}
          </span>
          <Copy className='h-3 w-3' />
        </button>
      )}
    </div>
  );
};
