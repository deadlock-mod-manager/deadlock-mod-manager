import { Card } from "@deadlock-mods/ui/components/card";
import { Handshake, Swords } from "@deadlock-mods/ui/icons";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayerAvatar } from "@/components/stats/account-switcher";
import { ChartCard } from "@/components/stats/chart-card";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import { PlayerDialog } from "@/components/stats/player-dialog";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type {
  EnemyStats,
  PlayerHeroStats,
  RankAsset,
  SteamProfile,
} from "@/lib/stats/api";
import type { MateInsight } from "@/lib/stats/derive";
import { formatDecimal, formatPercent } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

const TOP_MATES = 10;
const MAX_PIPS = 10;
/** The lift bars scale to the largest gap, but never past this. */
const MIN_SCALE = 0.15;

const points = (delta: number) => {
  const value = Math.round(delta * 1000) / 10;
  return `${value > 0 ? "+" : ""}${value}`;
};

interface SquadTabProps {
  mates: MateInsight[];
  partyIds: Set<number>;
  enemies: EnemyStats[];
  profilesById: Map<number, SteamProfile>;
  heroStatsById: Map<number, PlayerHeroStats[]>;
  careerWinrate: number;
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
}

const Spotlight = ({
  tone,
  icon: Icon,
  title,
  name,
  line,
  profile,
  figures,
  onOpen,
}: {
  tone: string;
  icon: typeof Swords;
  title: string;
  name: string;
  line: string;
  profile: SteamProfile | undefined;
  figures: Array<{ label: string; value: string; color?: string }>;
  onOpen: () => void;
}) => (
  <Card className='stats-surface flex flex-1 flex-col gap-3.5 p-5 shadow-none'>
    <span
      className='flex items-center gap-1.5 font-bold text-[10.5px] uppercase tracking-[0.12em]'
      style={{ color: tone }}>
      <Icon aria-hidden className='h-3.5 w-3.5' />
      {title}
    </span>
    <button
      className='flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      onClick={onOpen}
      type='button'>
      <PlayerAvatar className='h-12 w-12' name={name} profile={profile} />
      <span className='min-w-0'>
        <span className='block truncate font-bold text-base hover:underline'>
          {name}
        </span>
        <span className='block text-muted-foreground text-xs'>{line}</span>
      </span>
    </button>
    <div className='mt-auto flex border-border/60 border-t pt-3'>
      {figures.map((figure) => (
        <div className='flex flex-1 flex-col gap-1' key={figure.label}>
          <span className='font-semibold text-[9.5px] text-muted-foreground uppercase tracking-[0.1em]'>
            {figure.label}
          </span>
          <span
            className='font-bold font-mono text-[17px] leading-none'
            style={{ color: figure.color }}>
            {figure.value}
          </span>
        </div>
      ))}
    </div>
  </Card>
);

const PlayerButton = ({
  name,
  profile,
  onOpen,
  children,
}: {
  name: string;
  profile: SteamProfile | undefined;
  onOpen: () => void;
  children?: ReactNode;
}) => (
  <button
    className='flex min-w-0 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
    onClick={onOpen}
    type='button'>
    <PlayerAvatar className='h-8 w-8' name={name} profile={profile} />
    <span className='min-w-0'>
      <span className='block truncate font-semibold text-[13px] hover:underline'>
        {name}
      </span>
      {children}
    </span>
  </button>
);

const GRID =
  "grid grid-cols-[minmax(200px,1.6fr)_minmax(140px,1fr)_70px_100px_70px] items-center gap-4";

/** Who the player plays with and against, and what it does to their winrate. */
export const SquadTab = ({
  mates,
  partyIds,
  enemies,
  profilesById,
  heroStatsById,
  careerWinrate,
  heroesById,
  rankAssets,
}: SquadTabProps) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number | null>(null);
  const nameOf = (accountId: number) =>
    profilesById.get(accountId)?.personaname ?? `#${accountId}`;

  const lift = useMemo(
    () =>
      [...mates]
        .sort((a, b) => b.matchesTogether - a.matchesTogether)
        .slice(0, TOP_MATES)
        .sort((a, b) => b.winrateDelta - a.winrateDelta),
    [mates],
  );
  const duo = useMemo(
    () =>
      [...mates]
        .filter((mate) => mate.winrateDelta > 0)
        .sort((a, b) => b.winrateDelta - a.winrateDelta)[0],
    [mates],
  );
  const nemesis = enemies[0];
  const mostTogether = Math.max(
    1,
    ...mates.map((mate) => mate.matchesTogether),
  );
  const scale = Math.max(
    MIN_SCALE,
    ...lift.map((mate) => Math.abs(mate.winrateDelta)),
  );

  if (mates.length === 0) {
    return (
      <p className='py-10 text-center text-muted-foreground text-sm'>
        {t("stats.squad.empty")}
      </p>
    );
  }

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <div className='grid gap-4 xl:grid-cols-[1fr_340px]'>
        <ChartCard
          action={
            <div className='flex shrink-0 items-center gap-4 text-[11.5px] text-muted-foreground'>
              {(
                [
                  [LOSS_COLOR, "stats.squad.worseTogether"],
                  [WIN_COLOR, "stats.squad.betterTogether"],
                ] as const
              ).map(([color, label]) => (
                <span className='flex items-center gap-1.5' key={label}>
                  <span
                    className='h-2.5 w-2.5 rounded-[3px]'
                    style={{ backgroundColor: color }}
                  />
                  {t(label)}
                </span>
              ))}
            </div>
          }
          description={t("stats.squad.chartDescription", {
            winrate: formatPercent(careerWinrate, 0),
          })}
          title={t("stats.squad.chartTitle")}>
          <div className='flex flex-col gap-2.5'>
            {lift.map((mate) => {
              const good = mate.winrateDelta >= 0;
              const color = good ? WIN_COLOR : LOSS_COLOR;
              const share =
                Math.min(1, Math.abs(mate.winrateDelta) / scale) * 50;
              return (
                <div className='flex items-center gap-3' key={mate.mateId}>
                  <div className='w-48 shrink-0'>
                    <PlayerButton
                      name={nameOf(mate.mateId)}
                      onOpen={() => setSelected(mate.mateId)}
                      profile={profilesById.get(mate.mateId)}>
                      <span className='block font-mono text-[10.5px] text-muted-foreground'>
                        {t("stats.squad.games", {
                          count: mate.matchesTogether,
                        })}
                      </span>
                    </PlayerButton>
                  </div>
                  <div className='relative h-6 flex-1'>
                    <div className='absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-foreground/[0.04]' />
                    <div className='absolute top-0 left-1/2 h-6 w-px bg-foreground/20' />
                    <div
                      className={cn(
                        "absolute top-[6px] h-3",
                        good ? "left-1/2 rounded-r" : "right-1/2 rounded-l",
                      )}
                      style={{
                        width: `${Math.max(0.6, share)}%`,
                        background: `linear-gradient(${good ? "90deg" : "270deg"}, ${tint(color, 35)}, ${color})`,
                      }}
                    />
                    <span
                      className='absolute top-1 whitespace-nowrap font-mono font-semibold text-[11px]'
                      style={{
                        color,
                        ...(good
                          ? { left: `calc(50% + ${share}% + 8px)` }
                          : { right: `calc(50% + ${share}% + 8px)` }),
                      }}>
                      {t("stats.items.points", {
                        value: points(mate.winrateDelta),
                      })}
                    </span>
                  </div>
                  <span className='w-12 shrink-0 text-right font-mono font-semibold text-[12.5px]'>
                    {formatPercent(mate.winrateTogether, 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </ChartCard>
        <div className='flex flex-col gap-4'>
          {duo && (
            <Spotlight
              figures={[
                {
                  label: t("stats.squad.together"),
                  value: formatPercent(duo.winrateTogether, 0),
                  color: WIN_COLOR,
                },
                {
                  label: t("stats.squad.without"),
                  value: formatPercent(
                    duo.winrateTogether - duo.winrateDelta,
                    0,
                  ),
                },
                {
                  label: t("stats.squad.kda"),
                  value: formatDecimal(duo.kdaTogether, 1),
                },
              ]}
              icon={Handshake}
              line={t(
                partyIds.has(duo.mateId)
                  ? "stats.squad.duoLinePremade"
                  : "stats.squad.duoLine",
                { count: duo.matchesTogether },
              )}
              name={nameOf(duo.mateId)}
              onOpen={() => setSelected(duo.mateId)}
              profile={profilesById.get(duo.mateId)}
              title={t("stats.squad.bestDuo")}
              tone={WIN_COLOR}
            />
          )}
          {nemesis && (
            <Spotlight
              figures={[
                {
                  label: t("stats.squad.yourWins"),
                  value: formatPercent(
                    nemesis.wins / nemesis.matches_played,
                    0,
                  ),
                  color: LOSS_COLOR,
                },
                {
                  label: t("stats.squad.met"),
                  value: String(nemesis.matches_played),
                },
                {
                  label: t("stats.squad.record"),
                  value: `${nemesis.wins}-${nemesis.matches_played - nemesis.wins}`,
                },
              ]}
              icon={Swords}
              line={t("stats.squad.nemesisLine", {
                count: nemesis.matches_played,
                wins: nemesis.wins,
              })}
              name={nameOf(nemesis.enemy_id)}
              onOpen={() => setSelected(nemesis.enemy_id)}
              profile={profilesById.get(nemesis.enemy_id)}
              title={t("stats.squad.nemesis")}
              tone={LOSS_COLOR}
            />
          )}
        </div>
      </div>

      <div className='grid gap-4 xl:grid-cols-[1fr_340px]'>
        <Card className='stats-surface overflow-hidden shadow-none'>
          <div className='px-6 pt-5 pb-4'>
            <h3 className='font-semibold text-base leading-none'>
              {t("stats.squad.matesTitle")}
            </h3>
            <p className='mt-1.5 text-muted-foreground text-xs'>
              {t("stats.squad.matesDescription")}
            </p>
          </div>
          <div className='overflow-x-auto'>
            <div className='min-w-[640px]'>
              <div
                className={cn(
                  GRID,
                  "border-border/50 border-t px-6 py-2 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-[0.1em]",
                )}>
                <span>{t("stats.squad.player")}</span>
                <span>{t("stats.squad.matches")}</span>
                <span>{t("stats.squad.winrate")}</span>
                <span>{t("stats.squad.delta")}</span>
                <span>{t("stats.squad.kda")}</span>
              </div>
              {mates.map((mate) => {
                const good = mate.winrateDelta >= 0;
                const color = good ? WIN_COLOR : LOSS_COLOR;
                return (
                  <div
                    className={cn(
                      GRID,
                      "border-border/50 border-t px-6 py-2.5",
                    )}
                    key={mate.mateId}>
                    <span className='flex min-w-0 items-center gap-2'>
                      <PlayerButton
                        name={nameOf(mate.mateId)}
                        onOpen={() => setSelected(mate.mateId)}
                        profile={profilesById.get(mate.mateId)}
                      />
                      {partyIds.has(mate.mateId) && (
                        <span className='shrink-0 rounded-full border border-primary/15 bg-primary/[0.08] px-1.5 font-semibold text-[10px] text-primary'>
                          {t("stats.squad.party")}
                        </span>
                      )}
                    </span>
                    <span className='flex items-center gap-2.5'>
                      <span className='w-8 font-mono font-semibold text-[12.5px] tabular-nums'>
                        {mate.matchesTogether}
                      </span>
                      <span className='h-1 max-w-[100px] flex-1 overflow-hidden rounded-full bg-foreground/[0.06]'>
                        <span
                          className='block h-full rounded-full bg-primary/70'
                          style={{
                            width: `${Math.max(3, (mate.matchesTogether / mostTogether) * 100)}%`,
                          }}
                        />
                      </span>
                    </span>
                    <span className='font-mono font-semibold text-[12.5px]'>
                      {formatPercent(mate.winrateTogether, 0)}
                    </span>
                    <span>
                      <span
                        className='rounded-full px-2 py-0.5 font-mono font-semibold text-[11.5px]'
                        style={{ color, backgroundColor: tint(color, 11) }}>
                        {t("stats.items.points", {
                          value: points(mate.winrateDelta),
                        })}
                      </span>
                    </span>
                    <span className='font-mono text-[12.5px] text-foreground/80'>
                      {formatDecimal(mate.kdaTogether, 2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {enemies.length > 0 && (
          <Card className='stats-surface flex flex-col gap-3 self-start p-5 shadow-none'>
            <div>
              <h3 className='font-semibold text-base leading-none'>
                {t("stats.squad.nemesisTitle")}
              </h3>
              <p className='mt-1.5 text-muted-foreground text-xs'>
                {t("stats.squad.nemesisDescription")}
              </p>
            </div>
            {enemies.map((enemy) => {
              const losses = enemy.matches_played - enemy.wins;
              const pips = Math.min(enemy.matches_played, MAX_PIPS);
              const winPips = Math.round(
                (enemy.wins / enemy.matches_played) * pips,
              );
              return (
                <div
                  className='flex items-center gap-3 py-1'
                  key={enemy.enemy_id}>
                  <PlayerAvatar
                    className='h-8 w-8'
                    name={nameOf(enemy.enemy_id)}
                    profile={profilesById.get(enemy.enemy_id)}
                  />
                  <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
                    <div className='flex items-baseline justify-between gap-2'>
                      <button
                        className='truncate text-left font-semibold text-[12.5px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        onClick={() => setSelected(enemy.enemy_id)}
                        type='button'>
                        {nameOf(enemy.enemy_id)}
                      </button>
                      <span
                        className='shrink-0 font-mono font-semibold text-[11.5px]'
                        style={{
                          color: enemy.wins < losses ? LOSS_COLOR : undefined,
                        }}>
                        {enemy.wins}-{losses}
                      </span>
                    </div>
                    <div aria-hidden className='flex h-2 items-end gap-[3px]'>
                      {Array.from({ length: pips }, (_, pip) => (
                        <span
                          className={cn(
                            "w-3.5 rounded-[2px]",
                            pip < winPips ? "h-2" : "h-1.5",
                          )}
                          key={pip}
                          style={{
                            backgroundColor:
                              pip < winPips
                                ? tint(WIN_COLOR, 70)
                                : tint(LOSS_COLOR, 60),
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      <PlayerDialog
        accountId={selected}
        heroesById={heroesById}
        onOpenChange={(open) => !open && setSelected(null)}
        profile={selected === null ? undefined : profilesById.get(selected)}
        rankAssets={rankAssets}
        seed={
          selected === null
            ? undefined
            : { heroStats: heroStatsById.get(selected) }
        }
      />
    </div>
  );
};
