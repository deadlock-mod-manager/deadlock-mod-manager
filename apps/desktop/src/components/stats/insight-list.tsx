import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import {
  HERO_TILE_CLASS,
  LOSS_COLOR,
  tint,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
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

const heroIdOf = (insight: Insight): number | null =>
  insight.kind === "comfortHero" ||
  insight.kind === "trapHero" ||
  insight.kind === "topHero"
    ? insight.heroId
    : null;

/**
 * The kind alone is not unique - two hero insights of the same kind can make the
 * cut - so the key carries whatever the insight is actually about.
 */
const insightKey = (insight: Insight): string => {
  switch (insight.kind) {
    case "comfortHero":
    case "trapHero":
    case "topHero":
      return `${insight.kind}:${insight.heroId}`;
    case "hours":
      return `${insight.kind}:${insight.hour}`;
    case "session":
      return `${insight.kind}:${insight.position}`;
    default:
      return insight.kind;
  }
};

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

/** The number an insight is about and what it is measured against, if any. */
const comparisonOf = (
  insight: Insight,
): { value: number; baseline: number } | null => {
  switch (insight.kind) {
    case "form":
      return { value: insight.recent, baseline: insight.career };
    case "session":
    case "hours":
    case "longGames":
      return { value: insight.winrate, baseline: insight.baseline };
    default:
      return null;
  }
};

const toneColor = (tone: Insight["tone"]) =>
  tone === "good"
    ? WIN_COLOR
    : tone === "bad"
      ? LOSS_COLOR
      : "hsl(var(--muted-foreground))";

const MAX_STREAK_BEADS = 10;

/** The left column of an insight: its number drawn, not just written. */
const InsightVisual = ({
  insight,
  hero,
}: {
  insight: Insight;
  hero: DeadlockHero | undefined;
}) => {
  const { t } = useTranslation();
  const color = toneColor(insight.tone);
  const comparison = comparisonOf(insight);

  if (comparison) {
    return (
      <div className='flex w-[92px] shrink-0 flex-col gap-1.5'>
        <span
          className='font-bold text-[22px] leading-none tabular-nums'
          style={{ color }}>
          {formatPercent(comparison.value, 0)}
        </span>
        <span className='font-mono text-[10.5px] text-muted-foreground'>
          {t("stats.insights.versus", {
            value: formatPercent(comparison.baseline, 0),
          })}
        </span>
        <div aria-hidden className='relative mt-1 h-3'>
          <div className='absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-foreground/[0.08]' />
          <div
            className='absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded-full bg-primary/60'
            style={{ left: `${comparison.baseline * 100}%` }}
          />
          <div
            className='absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card'
            style={{
              left: `${comparison.value * 100}%`,
              backgroundColor: color,
            }}
          />
        </div>
      </div>
    );
  }

  if (insight.kind === "streak") {
    return (
      <div className='flex w-[92px] shrink-0 flex-col gap-2'>
        <span
          className='font-bold text-[22px] leading-none tabular-nums'
          style={{ color }}>
          {insight.won
            ? t("stats.insights.streakWins", { count: insight.length })
            : t("stats.insights.streakLosses", { count: insight.length })}
        </span>
        <div aria-hidden className='flex h-3 items-end gap-[3px]'>
          {Array.from(
            { length: Math.min(insight.length, MAX_STREAK_BEADS) },
            (_, bead) => (
              <span
                className={cn("w-2 rounded-[2px]", insight.won ? "h-3" : "h-2")}
                key={bead}
                style={{ backgroundColor: tint(color, 80) }}
              />
            ),
          )}
        </div>
      </div>
    );
  }

  const heroId = heroIdOf(insight);
  if (heroId !== null && "winrate" in insight) {
    return (
      <div className='flex w-[92px] shrink-0 items-center gap-2.5'>
        <HeroAvatar
          className={cn("h-10 w-10", HERO_TILE_CLASS)}
          hero={hero}
          heroId={heroId}
        />
        <span
          className='font-semibold text-sm tabular-nums'
          style={{ color: insight.winrate >= 0.5 ? WIN_COLOR : LOSS_COLOR }}>
          {formatPercent(insight.winrate, 0)}
        </span>
      </div>
    );
  }
  return null;
};

/**
 * The dashboard's one opinionated section: a few patterns worth acting on, each
 * led by its number drawn against your usual, then a sentence on what it means.
 * Tone is carried by wording and position as well as colour.
 */
export const InsightList = ({ insights, heroesById }: InsightListProps) => {
  const { t } = useTranslation();
  const describe = useInsightText();
  const capped = insights.slice(0, MAX_INSIGHTS);
  // Safety net for the two-column grid: drop a lone trailing entry rather than
  // leave a gap next to it. The fallback insights make this rare.
  const visible =
    capped.length > 1 && capped.length % 2 === 1 ? capped.slice(0, -1) : capped;

  if (visible.length === 0) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.insights.panelDescription")}
      title={t("stats.insights.panelTitle")}>
      <div className='grid gap-x-10 sm:grid-cols-2'>
        {visible.map((insight, index) => {
          const heroId = heroIdOf(insight);
          const hero = heroId === null ? undefined : heroesById.get(heroId);
          return (
            <div
              className={cn(
                "flex items-start gap-4 py-4",
                index > 0 && "border-border/60 border-t",
                index === 1 && "sm:border-t-0",
              )}
              key={insightKey(insight)}>
              <InsightVisual hero={hero} insight={insight} />
              <div className='min-w-0'>
                <div className='font-semibold text-[13.5px]'>
                  {t(`stats.insights.titles.${insight.kind}`, {
                    hero: hero?.name ?? "",
                  })}
                </div>
                <p className='mt-1 text-muted-foreground text-xs leading-relaxed'>
                  {describe(insight)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
};
