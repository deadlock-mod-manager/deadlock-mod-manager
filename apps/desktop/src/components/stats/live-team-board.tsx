import { Skull } from "@deadlock-mods/ui/icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { tint } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import {
  LivePanel,
  otherTeam,
  RankTag,
  teamColor,
  teamName,
  UnrankedTag,
  WinratePill,
} from "@/components/stats/live-parts";
import type { LiveScoreboardPlayer } from "@/hooks/use-live-match";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { RankAsset } from "@/lib/stats/api";
import { formatThousands, formatWhole } from "@/lib/stats/format";
import type { LiveLobby } from "@/lib/stats/live-lobby";
import { cn } from "@/lib/utils";

interface LiveTeamBoardProps {
  friendly: LiveScoreboardPlayer[];
  enemy: LiveScoreboardPlayer[];
  friendlyTeam: number;
  heroFor: (player: LiveScoreboardPlayer) => DeadlockHero | undefined;
  accountOf: (name: string) => number | null;
  lobby: LiveLobby;
  rankAssets: RankAsset[];
}

const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_48px_96px_150px_80px_140px_96px_112px] items-center gap-4";

const bySouls = (a: LiveScoreboardPlayer, b: LiveScoreboardPlayer) =>
  (b.souls ?? 0) - (a.souls ?? 0);

const sum = (
  players: LiveScoreboardPlayer[],
  valueOf: (player: LiveScoreboardPlayer) => number | null,
) => players.reduce((total, player) => total + (valueOf(player) ?? 0), 0);

const kdaOf = (player: LiveScoreboardPlayer) =>
  `${player.kills ?? "–"} / ${player.deaths ?? "–"} / ${player.assists ?? "–"}`;

/** One team's board, sorted by souls, with each player's record behind it. */
export const LiveTeamBoard = ({
  friendly,
  enemy,
  friendlyTeam,
  heroFor,
  accountOf,
  lobby,
  rankAssets,
}: LiveTeamBoardProps) => {
  const { t } = useTranslation();
  const [side, setSide] = useState<"friendly" | "enemy">("friendly");
  const team = side === "friendly" ? friendlyTeam : otherTeam(friendlyTeam);
  const color = teamColor(team);
  const players = useMemo(
    () => [...(side === "friendly" ? friendly : enemy)].sort(bySouls),
    [side, friendly, enemy],
  );
  const most = Math.max(1, ...players.map((player) => player.souls ?? 0));

  const switcher = (
    <div className='flex shrink-0 gap-0.5 rounded-[9px] border bg-background p-[3px]'>
      {(["friendly", "enemy"] as const).map((key) => {
        const value =
          key === "friendly" ? friendlyTeam : otherTeam(friendlyTeam);
        return (
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-[5px] font-semibold text-[12.5px] text-muted-foreground leading-4 transition-colors",
              side === key && "bg-secondary text-foreground",
            )}
            key={key}
            onClick={() => setSide(key)}
            type='button'>
            <span
              className='h-1.5 w-1.5 rounded-full'
              style={{ backgroundColor: teamColor(value) }}
            />
            {t(teamName(value))}
          </button>
        );
      })}
    </div>
  );

  return (
    <LivePanel
      action={switcher}
      className='pb-[9px]'
      description={t("stats.live.board.description")}
      title={
        side === "friendly"
          ? t("stats.live.friendly")
          : t("stats.live.pregame.enemy")
      }>
      <div className='overflow-x-auto'>
        <div className='flex min-w-[58rem] flex-col gap-1 pt-3.5'>
          <div
            className={cn(
              COLUMNS,
              "px-2.5 py-1.5 font-semibold text-[10px] text-muted-foreground/60 uppercase leading-[13px] tracking-[0.8px]",
            )}>
            <span>{t("stats.live.columns.player")}</span>
            <span className='text-right'>{t("stats.live.board.level")}</span>
            <span className='text-right'>{t("stats.live.labels.kda")}</span>
            <span>{t("stats.live.columns.souls")}</span>
            <span className='text-right'>{t("stats.live.labels.objDmg")}</span>
            <span>{t("stats.live.board.onHero")}</span>
            <span>{t("stats.live.board.allHeroes")}</span>
            <span>{t("stats.live.board.rank")}</span>
          </div>

          {players.length === 0 && (
            <span className='py-6 text-center text-muted-foreground text-sm'>
              {t("stats.live.teamPending")}
            </span>
          )}
          {players.map((player, index) => {
            const hero = heroFor(player);
            const accountId = accountOf(player.name);
            const record =
              accountId === null ? undefined : lobby.records.get(accountId);
            const onHero = hero ? record?.heroes.get(hero.id) : undefined;
            const badge =
              accountId === null ? undefined : lobby.ranks.get(accountId);
            return (
              <div
                className={cn(
                  COLUMNS,
                  "rounded-[9px] border border-transparent px-[9px] py-2 text-[13px] leading-[17px]",
                  index > 0 &&
                    !players[index - 1]?.isLocal &&
                    "border-t-foreground/[0.03]",
                  player.isDead && "opacity-55",
                )}
                // The top bar lists each player once per team; names can repeat.
                key={`${player.name}-${index}`}
                style={
                  player.isLocal
                    ? {
                        backgroundColor: tint(color, 6),
                        borderColor: tint(color, 18),
                      }
                    : undefined
                }>
                <div className='flex min-w-0 items-center gap-[11px]'>
                  <span className='relative shrink-0'>
                    <HeroAvatar
                      className='h-[34px] w-[34px] rounded-[9px] border border-foreground/[0.08]'
                      hero={hero}
                      heroId={hero?.id ?? player.heroId ?? 0}
                    />
                    {player.isLocal && (
                      <span
                        className='pointer-events-none absolute inset-0 rounded-[9px] border-[1.5px]'
                        style={{ borderColor: color }}
                      />
                    )}
                  </span>
                  <div className='flex min-w-0 flex-col gap-0.5'>
                    <span className='flex items-center gap-1.5 leading-[17px]'>
                      <span className='truncate font-semibold'>
                        {player.name}
                      </span>
                      {player.isLocal && (
                        <span
                          className='shrink-0 rounded px-1.5 font-bold text-[10px] leading-[13px]'
                          style={{ backgroundColor: tint(color, 15), color }}>
                          {t("stats.live.you")}
                        </span>
                      )}
                      {player.isDead && (
                        <span className='flex shrink-0 items-center gap-1 text-[#f2766b] text-[10.5px]'>
                          <Skull className='h-3 w-3' />
                          {t("stats.live.board.respawning")}
                        </span>
                      )}
                    </span>
                    <span className='truncate text-[11.5px] text-muted-foreground leading-[15px]'>
                      {player.heroName ?? hero?.name}
                    </span>
                  </div>
                </div>
                <span className='text-right font-mono tabular-nums'>
                  {player.level ?? "–"}
                </span>
                <span className='text-right font-mono tabular-nums'>
                  {kdaOf(player)}
                </span>
                <span className='flex items-center gap-2.5'>
                  <span className='w-11 shrink-0 text-right font-mono font-semibold tabular-nums'>
                    {player.souls === null
                      ? "–"
                      : formatThousands(player.souls)}
                  </span>
                  <span className='h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.05]'>
                    <span
                      className='block h-full rounded-full'
                      style={{
                        width: `${((player.souls ?? 0) / most) * 100}%`,
                        backgroundColor: player.isLocal
                          ? color
                          : tint(color, 45),
                      }}
                    />
                  </span>
                </span>
                <span className='text-right font-mono tabular-nums'>
                  {player.objectiveDamage === null
                    ? "–"
                    : formatWhole(player.objectiveDamage)}
                </span>
                <span className='flex items-center gap-2 text-xs leading-4'>
                  {onHero ? (
                    <>
                      {t("stats.live.board.games", { count: onHero.matches })}
                      <WinratePill record={onHero} />
                    </>
                  ) : (
                    <span className='text-muted-foreground'>
                      {record
                        ? t("stats.live.board.firstGame")
                        : t("stats.live.pregame.noRecord")}
                    </span>
                  )}
                </span>
                <span className='flex items-center gap-2 font-mono text-xs leading-4'>
                  {record ? (
                    <>
                      {formatThousands(record.overall.matches)}
                      <WinratePill record={record.overall} />
                    </>
                  ) : (
                    <span className='text-muted-foreground'>–</span>
                  )}
                </span>
                {badge === undefined ? (
                  <UnrankedTag label={t("stats.live.board.unranked")} />
                ) : (
                  <RankTag
                    badge={badge}
                    className='leading-4'
                    rankAssets={rankAssets}
                  />
                )}
              </div>
            );
          })}

          {players.length > 0 && (
            <div
              className={cn(
                COLUMNS,
                "border-foreground/[0.06] border-t p-2.5 font-mono font-semibold text-xs leading-4 tabular-nums",
              )}>
              <span className='font-sans text-muted-foreground'>
                {t("stats.live.board.team")}
              </span>
              <span />
              <span className='text-right'>
                {`${sum(players, (player) => player.kills)} / ${sum(players, (player) => player.deaths)} / ${sum(players, (player) => player.assists)}`}
              </span>
              <span className='w-11 text-right'>
                {formatThousands(sum(players, (player) => player.souls))}
              </span>
              <span className='text-right'>
                {formatWhole(sum(players, (player) => player.objectiveDamage))}
              </span>
            </div>
          )}
        </div>
      </div>
    </LivePanel>
  );
};
