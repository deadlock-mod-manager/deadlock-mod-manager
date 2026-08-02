import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChartCard } from "@/components/stats/chart-card";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { HeroPerformance } from "@/lib/stats/derive";
import { formatPercent } from "@/lib/stats/format";

interface HeroScatterProps {
  heroes: HeroPerformance[];
  heroesById: Map<number, DeadlockHero>;
  /** Overall winrate, drawn as the line that splits comfort picks from traps. */
  baseline: number;
  onSelect: (heroId: number) => void;
}

/**
 * Games played against winrate. Top right is a hero worth spamming, bottom right
 * is the one quietly costing games.
 */
export const HeroScatter = ({
  heroes,
  heroesById,
  baseline,
  onSelect,
}: HeroScatterProps) => {
  const { t } = useTranslation();

  const data = useMemo(
    () =>
      heroes.map((hero) => ({
        heroId: hero.heroId,
        name: heroesById.get(hero.heroId)?.name ?? `#${hero.heroId}`,
        matches: hero.matches,
        winrate: hero.winrate * 100,
        timePlayed: Math.round(hero.timePlayedMin / 60),
      })),
    [heroes, heroesById],
  );

  const config = {
    heroes: { label: t("stats.charts.heroes"), color: "var(--viz-series-1)" },
  } satisfies ChartConfig;

  if (data.length < 3) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.charts.scatterDescription")}
      title={t("stats.charts.scatterTitle")}>
      <ChartContainer className='aspect-auto h-[300px] w-full' config={config}>
        <ScatterChart margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid stroke='hsl(var(--chart-grid))' />
          <XAxis
            axisLine={false}
            dataKey='matches'
            name={t("stats.charts.matchesAxis")}
            tickLine={false}
            type='number'
          />
          <YAxis
            axisLine={false}
            dataKey='winrate'
            domain={[0, 100]}
            tickFormatter={(value: number) => `${value}%`}
            tickLine={false}
            ticks={[0, 25, 50, 75, 100]}
            type='number'
            width={40}
          />
          <ZAxis dataKey='timePlayed' range={[60, 400]} />
          <ReferenceLine
            stroke='hsl(var(--muted-foreground))'
            strokeDasharray='4 4'
            y={baseline * 100}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(_value, _name, item) => (
                  <span className='font-medium'>
                    {t("stats.charts.scatterTooltip", {
                      winrate: formatPercent(
                        Number(item?.payload?.winrate ?? 0) / 100,
                        0,
                      ),
                      matches: Number(item?.payload?.matches ?? 0),
                      hours: Number(item?.payload?.timePlayed ?? 0),
                    })}
                  </span>
                )}
                labelFormatter={(_, payload) =>
                  String(payload?.[0]?.payload?.name ?? "")
                }
              />
            }
            cursor={{ strokeDasharray: "4 4" }}
          />
          <Scatter
            className='cursor-pointer'
            data={data}
            fill='var(--color-heroes)'
            fillOpacity={0.75}
            onClick={(point: { heroId?: number }) => {
              if (point.heroId !== undefined) {
                onSelect(point.heroId);
              }
            }}
            stroke='hsl(var(--background))'
            strokeWidth={2}
          />
        </ScatterChart>
      </ChartContainer>
    </ChartCard>
  );
};
