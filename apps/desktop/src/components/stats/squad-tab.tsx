import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Card } from "@deadlock-mods/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deadlock-mods/ui/components/table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/stats/chart-card";
import type { EnemyStats, SteamProfile } from "@/lib/stats/api";
import type { MateInsight } from "@/lib/stats/derive";
import {
  formatDecimal,
  formatPercent,
  formatSignedPercent,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

const TOP_MATES = 10;

interface SquadTabProps {
  mates: MateInsight[];
  partyIds: Set<number>;
  enemies: EnemyStats[];
  profilesById: Map<number, SteamProfile>;
  careerWinrate: number;
}

const PlayerCell = ({
  accountId,
  profile,
}: {
  accountId: number;
  profile: SteamProfile | undefined;
}) => (
  <div className='flex items-center gap-2'>
    <Avatar className='h-7 w-7'>
      {profile?.avatarmedium && (
        <AvatarImage alt={profile.personaname} src={profile.avatarmedium} />
      )}
      <AvatarFallback className='text-xs'>
        {profile?.personaname?.charAt(0) ?? "?"}
      </AvatarFallback>
    </Avatar>
    <span className='truncate font-medium'>
      {profile?.personaname ?? `#${accountId}`}
    </span>
  </div>
);

export const SquadTab = ({
  mates,
  partyIds,
  enemies,
  profilesById,
  careerWinrate,
}: SquadTabProps) => {
  const { t } = useTranslation();

  const chartData = useMemo(
    () =>
      [...mates]
        .sort((a, b) => b.matchesTogether - a.matchesTogether)
        .slice(0, TOP_MATES)
        .sort((a, b) => b.winrateDelta - a.winrateDelta)
        .map((mate) => ({
          name: profilesById.get(mate.mateId)?.personaname ?? `#${mate.mateId}`,
          delta: mate.winrateDelta * 100,
          rawDelta: mate.winrateDelta,
          winrate: mate.winrateTogether,
          matches: mate.matchesTogether,
        })),
    [mates, profilesById],
  );

  const config = {
    delta: { label: t("stats.squad.delta") },
  } satisfies ChartConfig;

  if (mates.length === 0) {
    return (
      <p className='py-10 text-center text-muted-foreground text-sm'>
        {t("stats.squad.empty")}
      </p>
    );
  }

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <ChartCard
        description={t("stats.squad.chartDescription", {
          winrate: formatPercent(careerWinrate, 0),
        })}
        title={t("stats.squad.chartTitle")}>
        <ChartContainer
          className='aspect-auto w-full'
          config={config}
          style={{ height: `${Math.max(200, chartData.length * 34)}px` }}>
          <BarChart
            data={chartData}
            layout='vertical'
            margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
            <XAxis
              axisLine={false}
              tickFormatter={(value: number) => `${Math.round(value)}%`}
              tickLine={false}
              type='number'
            />
            <YAxis
              axisLine={false}
              dataKey='name'
              // Steam personas run long; clip them here rather than let recharts
              // cut the start of the name off.
              tickFormatter={(value: string) =>
                value.length > 18 ? `${value.slice(0, 17)}…` : value
              }
              tickLine={false}
              type='category'
              width={150}
            />
            <ReferenceLine stroke='hsl(var(--border))' x={0} />
            <ChartTooltip
              cursor={{ fill: "hsl(var(--accent))" }}
              content={
                <ChartTooltipContent
                  hideIndicator
                  formatter={(_value, _name, item) => (
                    <span className='font-medium'>
                      {t("stats.squad.tooltip", {
                        winrate: formatPercent(
                          Number(item?.payload?.winrate ?? 0),
                          0,
                        ),
                        matches: Number(item?.payload?.matches ?? 0),
                      })}
                    </span>
                  )}
                  labelFormatter={(_, payload) =>
                    String(payload?.[0]?.payload?.name ?? "")
                  }
                />
              }
            />
            <Bar dataKey='delta' maxBarSize={20} radius={4}>
              {chartData.map((entry) => (
                <Cell
                  fill={
                    entry.delta >= 0
                      ? "var(--viz-positive)"
                      : "var(--viz-negative)"
                  }
                  key={entry.name}
                />
              ))}
              <LabelList
                className='fill-muted-foreground'
                dataKey='rawDelta'
                fontSize={11}
                formatter={(value: number) => formatSignedPercent(value, 0)}
                position='right'
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <Card className='shadow-none'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("stats.squad.player")}</TableHead>
              <TableHead className='text-right'>
                {t("stats.squad.matches")}
              </TableHead>
              <TableHead className='text-right'>
                {t("stats.squad.winrate")}
              </TableHead>
              <TableHead className='text-right'>
                {t("stats.squad.delta")}
              </TableHead>
              <TableHead className='text-right'>
                {t("stats.squad.kda")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mates.map((mate) => (
              <TableRow key={mate.mateId}>
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <PlayerCell
                      accountId={mate.mateId}
                      profile={profilesById.get(mate.mateId)}
                    />
                    {partyIds.has(mate.mateId) && (
                      <Badge className='shrink-0' variant='secondary'>
                        {t("stats.squad.party")}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {mate.matchesTogether}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatPercent(mate.winrateTogether, 0)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    mate.winrateDelta >= 0
                      ? "text-emerald-500"
                      : "text-destructive",
                  )}>
                  {formatSignedPercent(mate.winrateDelta, 1)}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatDecimal(mate.kdaTogether)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {enemies.length > 0 && (
        <Card className='shadow-none'>
          <div className='border-b p-4'>
            <h3 className='font-semibold text-base'>
              {t("stats.squad.nemesisTitle")}
            </h3>
            <p className='text-muted-foreground text-xs'>
              {t("stats.squad.nemesisDescription")}
            </p>
          </div>
          <Table>
            <TableBody>
              {enemies.map((enemy) => (
                <TableRow key={enemy.enemy_id}>
                  <TableCell>
                    <PlayerCell
                      accountId={enemy.enemy_id}
                      profile={profilesById.get(enemy.enemy_id)}
                    />
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {t("stats.squad.encounters", {
                      count: enemy.matches_played,
                    })}
                  </TableCell>
                  <TableCell className='w-24 text-right text-destructive tabular-nums'>
                    {formatPercent(enemy.wins / enemy.matches_played, 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};
