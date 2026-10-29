import { Hourglass, Loader2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import {
  LivePanel,
  otherTeam,
  PANEL_CLASS,
  RankTag,
  Tag,
  teamColor,
  UnrankedTag,
  teamName,
  WinratePill,
} from "@/components/stats/live-parts";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { type RankAsset, rankLabel } from "@/lib/stats/api";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
  formatThousands,
} from "@/lib/stats/format";
import {
  averageBadge,
  FORM_LENGTH,
  isOneTrick,
  type LiveLobby,
  streakOf,
  type WinRecord,
} from "@/lib/stats/live-lobby";
import { cn } from "@/lib/utils";
import type { LiveScoreboard } from "@/types/generated/LiveScoreboard";
import type { LiveScoreboardPlayer } from "@/types/generated/LiveScoreboardPlayer";
import type { Team } from "@/types/generated/Team";

interface LiveScoutingProps {
  board: LiveScoreboard;
  heroFor: (player: LiveScoreboardPlayer) => DeadlockHero | undefined;
  lobby: LiveLobby;
  rankAssets: RankAsset[];
}

/** Fewer games than this against a hero says nothing about the matchup. */
const MIN_MATCHUP_GAMES = 5;
const HARD_MATCHUP = 0.45;
const GOOD_MATCHUP = 0.6;

const NEUTRAL = "#a3a3a3";
const ORANGE = "#f28a4b";
const SKY = "#60a5fa";

interface Scouted {
  player: LiveScoreboardPlayer;
  hero: DeadlockHero | undefined;
  accountId: number | null;
}

const winrateOf = (record: WinRecord) => record.wins / record.matches;

const mean = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Everyone in the lobby before the zipline: both teams with each player's rank,
 * record on the hero they locked and recent form, plus how your hero has done
 * against theirs.
 */
export const LiveScouting = ({
  board,
  heroFor,
  lobby,
  rankAssets,
}: LiveScoutingProps) => {
  const { t } = useTranslation();
  const scout = (players: LiveScoreboardPlayer[]): Scouted[] =>
    players.map((player) => ({
      player,
      hero: heroFor(player),
      accountId: player.accountId,
    }));
  const friendly = scout(board.friendly);
  const enemy = scout(board.enemy);
  const you = friendly.find((entry) => entry.player.isLocal);
  const enemyTeam = otherTeam(board.team);

  const recordOf = (entry: Scouted) =>
    entry.accountId === null ? undefined : lobby.records.get(entry.accountId);
  const onHeroOf = (entry: Scouted) =>
    entry.hero ? recordOf(entry)?.heroes.get(entry.hero.id) : undefined;

  const teamStats = (team: Scouted[]) => {
    const onHero = team.flatMap((entry) => onHeroOf(entry) ?? []);
    const pooled = onHero.reduce(
      (sum, record) => ({
        matches: sum.matches + record.matches,
        wins: sum.wins + record.wins,
      }),
      { matches: 0, wins: 0 },
    );
    return {
      rank: averageBadge(
        team.flatMap((entry) =>
          entry.accountId === null
            ? []
            : (lobby.ranks.get(entry.accountId) ?? []),
        ),
      ),
      onHero: mean(onHero.map((record) => record.matches)),
      winrate: pooled.matches > 0 ? pooled.wins / pooled.matches : null,
      matches: team.reduce(
        (sum, entry) => sum + (recordOf(entry)?.overall.matches ?? 0),
        0,
      ),
    };
  };
  const ours = teamStats(friendly);
  const theirs = teamStats(enemy);

  const comparisons = [
    {
      key: "rank",
      ours: ours.rank,
      theirs: theirs.rank,
      format: (value: number) =>
        rankLabel(value, rankAssets) ?? formatDecimal(value, 0),
    },
    {
      key: "onHero",
      ours: ours.onHero,
      theirs: theirs.onHero,
      format: (value: number) => formatCompact(Math.round(value)),
    },
    {
      key: "winrate",
      ours: ours.winrate,
      theirs: theirs.winrate,
      format: (value: number) => formatPercent(value, 0),
    },
    {
      key: "matches",
      ours: ours.matches,
      theirs: theirs.matches,
      format: (value: number) => formatThousands(value),
    },
  ];

  const tagsFor = (entry: Scouted, isEnemy: boolean) => {
    const tags: { label: string; color: string }[] = [];
    const id = entry.accountId;
    const record = recordOf(entry);
    if (id !== null && !entry.player.isLocal) {
      const met = (isEnemy ? lobby.enemies : lobby.mates).get(id);
      if (met && isEnemy) {
        const lost = met.matches - met.wins;
        tags.push(
          lost > met.wins
            ? {
                label: t("stats.live.scouting.beatYou", {
                  lost,
                  count: met.matches,
                }),
                color: LOSS_COLOR,
              }
            : {
                label: t("stats.live.scouting.againstYou", {
                  count: met.matches,
                }),
                color: ORANGE,
              },
        );
      } else if (met) {
        tags.push({
          label: t("stats.live.scouting.withYou", { count: met.matches }),
          color: WIN_COLOR,
        });
      }
    }
    if (!record) {
      if (!entry.player.isLocal) {
        tags.push({
          label: t("stats.live.pregame.noRecord"),
          color: NEUTRAL,
        });
      }
      return tags;
    }
    if (entry.hero && !onHeroOf(entry)) {
      tags.push({ label: t("stats.live.scouting.firstGame"), color: NEUTRAL });
    } else if (entry.hero && isOneTrick(record, entry.hero.id)) {
      tags.push({ label: t("stats.live.scouting.oneTrick"), color: SKY });
    }
    const streak = streakOf(id === null ? [] : (lobby.form.get(id) ?? []));
    if (streak) {
      tags.push({
        label: t(
          streak.won
            ? "stats.live.scouting.winStreak"
            : "stats.live.scouting.lossStreak",
          { count: streak.length },
        ),
        color: streak.won ? WIN_COLOR : LOSS_COLOR,
      });
    }
    return tags;
  };

  const renderTeam = (players: Scouted[], team: Team, isEnemy: boolean) => {
    const color = teamColor(team);
    return (
      <div
        className={cn(
          PANEL_CLASS,
          "flex flex-col gap-0.5 px-[19px] pt-[17px] pb-[7px]",
        )}>
        <div className='flex items-center justify-between pb-2.5'>
          <span className='flex items-center gap-2'>
            <span
              className='h-4 w-1 rounded-[2px]'
              style={{ backgroundColor: color }}
            />
            <span className='font-medium text-[15px] leading-[19px]'>
              {t(teamName(team))}
            </span>
            {!isEnemy && (
              <span className='text-muted-foreground text-xs leading-4'>
                {t("stats.live.friendly")}
              </span>
            )}
          </span>
          <span className='flex gap-3 pr-2 font-semibold text-[10px] text-muted-foreground/60 uppercase leading-[13px] tracking-[0.8px]'>
            <span className='w-24'>{t("stats.live.scouting.onHero")}</span>
            <span className='w-[34px] text-right'>
              {t("stats.live.scouting.kda")}
            </span>
            <span className='w-[98px]'>{t("stats.live.scouting.form")}</span>
          </span>
        </div>
        {players.map((entry, index) => {
          const onHero = onHeroOf(entry);
          const record = recordOf(entry);
          const form =
            entry.accountId === null
              ? undefined
              : lobby.form.get(entry.accountId);
          const badge =
            entry.accountId === null
              ? undefined
              : lobby.ranks.get(entry.accountId);
          const tags = tagsFor(entry, isEnemy);
          return (
            <div
              className={cn(
                "flex items-center gap-3 rounded-[9px] border border-transparent px-[7px] py-2",
                index > 0 && "border-t-foreground/[0.04]",
              )}
              // The top bar lists each player once per team; names can repeat.
              key={`${entry.player.name}-${index}`}
              style={
                entry.player.isLocal
                  ? {
                      backgroundColor: tint(color, 6),
                      borderColor: tint(color, 18),
                    }
                  : undefined
              }>
              <span className='relative shrink-0'>
                <HeroAvatar
                  className='h-[38px] w-[38px] rounded-[10px] border border-foreground/[0.08]'
                  hero={entry.hero}
                  heroId={entry.hero?.id ?? entry.player.heroId ?? 0}
                />
                {entry.player.isLocal && (
                  <span
                    className='pointer-events-none absolute inset-0 rounded-[10px] border-[1.5px]'
                    style={{ borderColor: color }}
                  />
                )}
              </span>
              <div className='flex min-w-0 flex-1 flex-col gap-[3px]'>
                <span className='flex min-w-0 items-center gap-[7px] leading-[17px]'>
                  <span className='truncate font-semibold text-[13px]'>
                    {entry.player.name}
                  </span>
                  {badge === undefined ? (
                    record && (
                      <UnrankedTag
                        className='text-[11.5px]'
                        label={t("stats.live.board.unranked")}
                      />
                    )
                  ) : (
                    <RankTag
                      badge={badge}
                      className='text-[11.5px]'
                      rankAssets={rankAssets}
                    />
                  )}
                </span>
                <span className='flex min-w-0 items-center gap-[7px] text-[11.5px] text-muted-foreground leading-[15px]'>
                  <span className='truncate'>
                    {entry.player.heroName ?? entry.hero?.name}
                  </span>
                  {tags.map((tag) => (
                    <Tag color={tag.color} key={tag.label}>
                      {tag.label}
                    </Tag>
                  ))}
                </span>
              </div>
              <span className='flex w-24 shrink-0 items-center gap-[7px] font-mono font-semibold text-[12.5px] leading-4 tabular-nums'>
                {onHero ? (
                  <>
                    {onHero.matches}
                    <WinratePill record={onHero} />
                  </>
                ) : entry.accountId !== null && lobby.isPending ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin text-muted-foreground' />
                ) : (
                  <span className='font-sans font-normal text-muted-foreground text-xs'>
                    {record ? t("stats.live.scouting.noneYet") : "–"}
                  </span>
                )}
              </span>
              <span className='w-[34px] shrink-0 text-right font-mono text-[12.5px] leading-4 tabular-nums'>
                {record ? formatDecimal(record.overall.kda, 1) : "–"}
              </span>
              <span className='flex w-[98px] shrink-0 items-center gap-0.5'>
                {Array.from({ length: FORM_LENGTH }, (_, slot) => {
                  // Oldest on the left, so the latest result is where you read last.
                  const won = form?.[FORM_LENGTH - 1 - slot];
                  return (
                    <span
                      className='w-2 rounded-[2px]'
                      key={slot}
                      style={{
                        height: won === undefined ? 4 : 14,
                        backgroundColor:
                          won === undefined
                            ? "hsl(var(--foreground) / 0.08)"
                            : tint(won ? WIN_COLOR : LOSS_COLOR, won ? 70 : 50),
                      }}
                    />
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const matchups = enemy.flatMap((entry) => {
    if (!entry.hero) return [];
    const record = lobby.matchups.get(entry.hero.id) ?? {
      matches: 0,
      wins: 0,
    };
    return [{ hero: entry.hero, record }];
  });
  const rated = matchups.filter(
    (matchup) => matchup.record.matches >= MIN_MATCHUP_GAMES,
  );
  const hardest = [...rated].sort(
    (a, b) => winrateOf(a.record) - winrateOf(b.record),
  )[0];
  const pooled = matchups.reduce(
    (sum, { record }) => ({
      matches: sum.matches + record.matches,
      wins: sum.wins + record.wins,
    }),
    { matches: 0, wins: 0 },
  );
  const pooledColor =
    pooled.matches > 0 && winrateOf(pooled) < 0.5 ? LOSS_COLOR : WIN_COLOR;

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <div
        className={cn(
          PANEL_CLASS,
          "flex flex-wrap items-center gap-x-6 gap-y-4 px-[23px] py-[17px]",
        )}
        style={{
          backgroundImage: `linear-gradient(90deg, ${tint(teamColor(board.team), 8)}, transparent 40%, transparent 60%, ${tint(teamColor(enemyTeam), 8)})`,
        }}>
        <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
          <span className='flex w-fit items-center gap-1.5 rounded-full bg-[#fbbf24]/[0.12] px-2 py-[3px] font-bold font-mono text-[#fbbf24] text-[11px] uppercase leading-[14px] tracking-[0.4px]'>
            <Hourglass className='h-3 w-3' />
            {t("stats.live.scouting.badge")}
          </span>
          <span className='font-bold text-2xl leading-[31px] tracking-[-0.3px]'>
            {t("stats.live.scouting.title")}
          </span>
          <span className='text-[12.5px] text-muted-foreground leading-4'>
            {t("stats.live.scouting.hint")}
          </span>
        </div>
        <div className='flex flex-wrap gap-6'>
          {comparisons.map((comparison) => {
            const both = comparison.ours !== null && comparison.theirs !== null;
            const share = both
              ? (comparison.ours ?? 0) /
                Math.max((comparison.ours ?? 0) + (comparison.theirs ?? 0), 1)
              : 0.5;
            const ahead =
              both && (comparison.ours ?? 0) > (comparison.theirs ?? 0);
            const behind =
              both && (comparison.ours ?? 0) < (comparison.theirs ?? 0);
            const [left, right] = [teamColor(board.team), teamColor(enemyTeam)];
            return (
              <div
                className={cn(
                  "flex flex-col gap-1.5",
                  comparison.key === "rank" ? "w-[240px]" : "w-[150px]",
                )}
                key={comparison.key}>
                <span className='font-semibold text-[10px] text-muted-foreground/75 uppercase leading-[13px] tracking-[0.8px]'>
                  {t(`stats.live.scouting.compare.${comparison.key}`)}
                </span>
                <span className='flex justify-between gap-3 font-bold font-mono text-[14px] leading-[18px] tabular-nums'>
                  <span style={ahead ? { color: left } : undefined}>
                    {comparison.ours === null
                      ? "–"
                      : comparison.format(comparison.ours)}
                  </span>
                  <span style={behind ? { color: right } : undefined}>
                    {comparison.theirs === null
                      ? "–"
                      : comparison.format(comparison.theirs)}
                  </span>
                </span>
                <span className='flex h-1 gap-0.5'>
                  <span
                    className='rounded-full'
                    style={{
                      width: `${share * 100}%`,
                      backgroundColor: ahead ? left : tint(left, 35),
                    }}
                  />
                  <span
                    className='flex-1 rounded-full'
                    style={{
                      backgroundColor: behind ? right : tint(right, 35),
                    }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className='grid gap-4 xl:grid-cols-2'>
        {renderTeam(friendly, board.team, false)}
        {renderTeam(enemy, enemyTeam, true)}
      </div>

      {you?.hero && matchups.length > 0 && (
        <LivePanel
          action={
            pooled.matches > 0 && (
              <span className='flex shrink-0 items-center gap-2 text-muted-foreground text-xs leading-4'>
                {t("stats.live.scouting.acrossMatchups", {
                  count: pooled.matches,
                })}
                <span
                  className='rounded-full px-[9px] py-[3px] font-bold font-mono text-xs leading-4 tabular-nums'
                  style={{
                    backgroundColor: tint(pooledColor, 10),
                    color: pooledColor,
                  }}>
                  {formatPercent(winrateOf(pooled), 0)}
                </span>
              </span>
            )
          }
          description={t("stats.live.scouting.matchupsDescription", {
            hero: you.hero.name,
          })}
          title={t("stats.live.scouting.matchupsTitle", {
            hero: you.hero.name,
          })}>
          <div className='grid grid-cols-2 gap-3 pt-4 md:grid-cols-3 xl:grid-cols-6'>
            {matchups.map(({ hero, record }) => {
              const enough = record.matches >= MIN_MATCHUP_GAMES;
              const winrate = enough ? winrateOf(record) : null;
              const color =
                winrate === null
                  ? NEUTRAL
                  : winrate >= 0.55
                    ? WIN_COLOR
                    : winrate < HARD_MATCHUP
                      ? LOSS_COLOR
                      : "hsl(var(--primary))";
              const note =
                winrate === null
                  ? null
                  : hero.id === hardest?.hero.id && winrate < HARD_MATCHUP
                    ? {
                        label: t("stats.live.scouting.hardest"),
                        color: LOSS_COLOR,
                      }
                    : winrate >= GOOD_MATCHUP
                      ? {
                          label: t("stats.live.scouting.best"),
                          color: WIN_COLOR,
                        }
                      : null;
              return (
                <div
                  className='flex flex-col gap-2.5 rounded-[11px] border bg-background p-[13px]'
                  key={hero.id}
                  style={
                    note?.color === LOSS_COLOR
                      ? { borderColor: tint(LOSS_COLOR, 25) }
                      : undefined
                  }>
                  <span className='flex items-center gap-2.5'>
                    <HeroAvatar
                      className='h-8 w-8 rounded-lg'
                      hero={hero}
                      heroId={hero.id}
                    />
                    <span className='flex min-w-0 flex-col gap-px'>
                      <span className='truncate font-semibold text-[12.5px] leading-4'>
                        {t("stats.live.scouting.versus", { hero: hero.name })}
                      </span>
                      <span className='text-[11px] text-muted-foreground leading-[14px]'>
                        {t("stats.live.board.games", { count: record.matches })}
                      </span>
                    </span>
                  </span>
                  <span className='flex items-end justify-between'>
                    <span
                      className={cn(
                        "font-bold font-mono tabular-nums",
                        winrate === null
                          ? "text-[13px] leading-4"
                          : "text-xl leading-[26px]",
                      )}
                      style={{ color }}>
                      {winrate === null
                        ? t("stats.live.scouting.tooFew")
                        : formatPercent(winrate, 0)}
                    </span>
                    {note && (
                      <span
                        className='font-semibold text-[10.5px] leading-[14px]'
                        style={{ color: note.color }}>
                        {note.label}
                      </span>
                    )}
                  </span>
                  <span className='h-1 overflow-hidden rounded-full bg-foreground/[0.05]'>
                    {winrate !== null && (
                      <span
                        className='block h-full rounded-full'
                        style={{
                          width: `${winrate * 100}%`,
                          backgroundColor: color,
                        }}
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </LivePanel>
      )}
    </div>
  );
};
