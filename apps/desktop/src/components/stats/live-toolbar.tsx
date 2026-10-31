import { Copy, PlugZap, Radio } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { WIN_COLOR } from "@/components/stats/chart-fx";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { useLiveBoard } from "@/hooks/use-live-match";
import { cn } from "@/lib/utils";

/**
 * The Live tab's icon in the tab row: a pulsing dot while the player is in a
 * match, the plain radio icon like every other tab otherwise.
 */
export const LiveTabIcon = ({ className }: { className?: string }) => {
  const { phase, board } = useLiveBoard(
    useExperimentalFeature("live-scoreboard"),
  );
  if (!board || (phase !== "pregame" && phase !== "inProgress")) {
    return <Radio className={className} />;
  }
  return (
    <span
      className={cn("flex items-center justify-center", className)}
      data-live>
      <span className='h-[7px] w-[7px] animate-pulse rounded-full bg-red-400 shadow-[0_0_8px] shadow-red-400/70' />
    </span>
  );
};

/**
 * The Live tab's side of the Stats page's tab row: where the board comes from,
 * how fresh it is, and which match it is. The page's filters don't apply here.
 */
export const LiveToolbar = () => {
  const { t } = useTranslation();
  const { phase, board, matchId } = useLiveBoard(
    useExperimentalFeature("live-scoreboard"),
  );
  if (!board || (phase !== "pregame" && phase !== "inProgress")) return null;

  const { reportedAt } = board;
  return (
    <div className='flex flex-wrap items-center gap-2.5 text-xs'>
      <span className='stats-surface flex h-[30px] items-center gap-[7px] rounded-lg border px-2.5'>
        <PlugZap className='h-[13px] w-[13px]' style={{ color: WIN_COLOR }} />
        <span className='font-medium'>
          {phase === "pregame"
            ? t("stats.live.status.versusScreen")
            : t("stats.live.status.connected")}
        </span>
        {reportedAt !== null && (
          <span className='text-muted-foreground'>
            {t("stats.live.status.updated", {
              count: Math.max(0, Math.round((Date.now() - reportedAt) / 1000)),
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
