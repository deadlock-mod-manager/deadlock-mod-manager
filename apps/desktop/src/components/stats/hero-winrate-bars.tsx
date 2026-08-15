import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { formatPercent } from "@/lib/stats/format";

export interface HeroWinrate {
  heroId: number;
  name: string;
  /** Percent, 0-100. */
  winrate: number;
  matches: number;
}

/**
 * A player's winrate on the heroes they pick most, against the even-odds line.
 * Rows grow the plot rather than squeezing into a fixed height, so six heroes
 * stay as readable as two.
 */
export const HeroWinrateBars = ({
  heroes,
  onSelect,
}: {
  heroes: HeroWinrate[];
  /** Makes each bar a way into that hero's own breakdown. */
  onSelect?: (heroId: number) => void;
}) => {
  const { t } = useTranslation();

  const config = {
    winrate: { label: t("stats.charts.winrate") },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      className='aspect-auto w-full'
      config={config}
      style={{ height: `${Math.max(140, heroes.length * 28)}px` }}>
      <BarChart
        data={heroes}
        layout='vertical'
        margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
        <XAxis
          axisLine={false}
          domain={[0, 100]}
          tickFormatter={(value: number) => `${value}%`}
          tickLine={false}
          ticks={[0, 50, 100]}
          type='number'
        />
        <YAxis
          axisLine={false}
          dataKey='name'
          // Without this recharts thins the ticks out and half the heroes end up
          // unlabelled.
          interval={0}
          tickLine={false}
          type='category'
          width={96}
        />
        <ReferenceLine stroke='hsl(var(--muted-foreground))' x={50} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_value, _name, item) => (
                <span className='font-medium'>
                  {t("stats.player.onHeroShort", {
                    matches: Number(item?.payload?.matches ?? 0),
                    winrate: formatPercent(
                      Number(item?.payload?.winrate ?? 0) / 100,
                      0,
                    ),
                  })}
                </span>
              )}
              labelFormatter={(_, payload) =>
                String(payload?.[0]?.payload?.name ?? "")
              }
            />
          }
          cursor={{ fill: "hsl(var(--accent))" }}
        />
        <Bar
          cursor={onSelect ? "pointer" : undefined}
          dataKey='winrate'
          maxBarSize={16}
          // recharts hands the click the rendered rectangle, not the row behind
          // it - the hero has to come back out of the data by index.
          onClick={(_, index: number) => {
            const heroId = heroes[index]?.heroId;
            if (heroId !== undefined) {
              onSelect?.(heroId);
            }
          }}
          radius={4}>
          {heroes.map((hero) => (
            <Cell
              fill={
                hero.winrate >= 50
                  ? "var(--viz-positive)"
                  : "var(--viz-negative)"
              }
              key={hero.heroId}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
};
