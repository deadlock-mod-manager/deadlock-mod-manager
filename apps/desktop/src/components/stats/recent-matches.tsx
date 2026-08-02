import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { isWin } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDateTime,
  formatDuration,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

const RECENT_COUNT = 15;

interface RecentMatchesProps {
  matches: MatchHistoryEntry[];
  heroesById: Map<number, DeadlockHero>;
}

/** The last handful of games at a glance: hero, result, and the numbers on hover. */
export const RecentMatches = ({ matches, heroesById }: RecentMatchesProps) => {
  const { t, i18n } = useTranslation();
  const recent = [...matches]
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, RECENT_COUNT);

  if (recent.length === 0) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.charts.recentDescription", {
        count: recent.length,
      })}
      title={t("stats.charts.recentTitle")}>
      <div className='flex flex-wrap gap-2'>
        {recent.map((match) => {
          const won = isWin(match);
          const hero = heroesById.get(match.hero_id);
          return (
            <Tooltip key={match.match_id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border-2 p-1",
                    won
                      ? "border-emerald-500/60 bg-emerald-500/5"
                      : "border-destructive/60 bg-destructive/5",
                  )}>
                  <HeroAvatar hero={hero} heroId={match.hero_id} />
                  <span className='font-medium text-[10px] text-muted-foreground tabular-nums'>
                    {match.player_kills}/{match.player_deaths}/
                    {match.player_assists}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent className='space-y-0.5'>
                <div className='font-medium'>
                  {hero?.name ?? `#${match.hero_id}`} -{" "}
                  {won ? t("stats.win") : t("stats.loss")}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {formatDateTime(match.start_time, i18n.language)}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {t("stats.charts.recentTooltip", {
                    souls: formatCompact(match.net_worth),
                    duration: formatDuration(match.match_duration_s),
                  })}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </ChartCard>
  );
};
