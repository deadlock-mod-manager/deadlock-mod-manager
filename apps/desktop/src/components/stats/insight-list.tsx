import { Card } from "@deadlock-mods/ui/components/card";
import { Lightbulb, TrendingDown, TrendingUp } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { Insight } from "@/lib/stats/derive";
import { formatHourRange, formatPercent } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

interface InsightListProps {
  insights: Insight[];
  heroesById: Map<number, DeadlockHero>;
}

const MAX_INSIGHTS = 4;

const useInsightText = () => {
  const { t } = useTranslation();

  return (insight: Insight): string => {
    switch (insight.kind) {
      case "form":
        return t("stats.insights.form", {
          recent: formatPercent(insight.recent, 0),
          career: formatPercent(insight.career, 0),
        });
      case "streak":
        return insight.won
          ? t("stats.insights.winStreak", { count: insight.length })
          : t("stats.insights.lossStreak", { count: insight.length });
      case "session":
        return t("stats.insights.session", {
          position: insight.position,
          winrate: formatPercent(insight.winrate, 0),
          baseline: formatPercent(insight.baseline, 0),
        });
      case "hours":
        return t("stats.insights.hours", {
          range: formatHourRange(insight.hour),
          winrate: formatPercent(insight.winrate, 0),
          baseline: formatPercent(insight.baseline, 0),
        });
      case "comfortHero":
        return t("stats.insights.comfortHero", {
          winrate: formatPercent(insight.winrate, 0),
          matches: insight.matches,
        });
      case "trapHero":
        return t("stats.insights.trapHero", {
          winrate: formatPercent(insight.winrate, 0),
          matches: insight.matches,
        });
      case "topHero":
        return t("stats.insights.topHero", {
          winrate: formatPercent(insight.winrate, 0),
          matches: insight.matches,
        });
      case "longGames":
        return t("stats.insights.longGames", {
          minutes: insight.minutes,
          winrate: formatPercent(insight.winrate, 0),
          baseline: formatPercent(insight.baseline, 0),
        });
    }
  };
};

/**
 * The dashboard's one opinionated section: a few sentences about what the numbers
 * actually mean. Tone is carried by an icon plus the wording, never colour alone.
 */
export const InsightList = ({ insights, heroesById }: InsightListProps) => {
  const { t } = useTranslation();
  const describe = useInsightText();
  const capped = insights.slice(0, MAX_INSIGHTS);
  // Safety net for the two-column grid: drop a lone trailing card rather than
  // leave a gap next to it. The fallback insights make this rare.
  const visible =
    capped.length > 1 && capped.length % 2 === 1 ? capped.slice(0, -1) : capped;

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      {visible.map((insight) => {
        const heroId =
          insight.kind === "comfortHero" ||
          insight.kind === "trapHero" ||
          insight.kind === "topHero"
            ? insight.heroId
            : null;
        const Icon =
          insight.tone === "good"
            ? TrendingUp
            : insight.tone === "bad"
              ? TrendingDown
              : Lightbulb;

        return (
          <Card
            className='flex items-start gap-3 p-3 shadow-none'
            key={insight.kind}>
            {heroId === null ? (
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  insight.tone === "good"
                    ? "bg-emerald-500/10 text-emerald-500"
                    : insight.tone === "bad"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground",
                )}>
                <Icon className='h-4 w-4' />
              </span>
            ) : (
              <HeroAvatar
                hero={heroesById.get(heroId)}
                heroId={heroId}
                className='mt-0.5 shrink-0'
              />
            )}
            <div className='min-w-0'>
              <div className='font-medium text-sm'>
                {t(`stats.insights.titles.${insight.kind}`, {
                  hero: heroId !== null ? heroesById.get(heroId)?.name : "",
                })}
              </div>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {describe(insight)}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
