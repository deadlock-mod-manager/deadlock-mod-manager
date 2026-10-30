import { Skull } from "@deadlock-mods/ui/icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DANGER_COLOR, tint } from "@/components/stats/chart-fx";
import {
  LivePanel,
  Meter,
  RankTag,
  UnrankedTag,
  WinratePill,
} from "@/components/stats/live-parts";
import {
  LiveHeroAvatar,
  LivePlayerRow,
  playerKey,
} from "@/components/stats/live-player";
import type { RankAsset } from "@/lib/stats/api";
import { formatKda, formatThousands, formatWhole } from "@/lib/stats/format";
import { type LiveLobby, lobbyEntryOf } from "@/lib/stats/live-lobby";
import {
  otherTeam,
  type ResolvedBoard,
  type ResolvedPlayer,
  teamColor,
  teamName,
  teamTotal,
} from "@/lib/stats/live-teams";
import { cn } from "@/lib/utils";

interface LiveTeamBoardProps {
  board: ResolvedBoard;
  lobby: LiveLobby;
  rankAssets: RankAsset[];
}

const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_48px_96px_150px_80px_140px_96px_112px] items-center gap-4";

const bySouls = (a: ResolvedPlayer, b: ResolvedPlayer) =>
  (b.player.souls ?? 0) - (a.player.souls ?? 0);

/** One team's board, sorted by souls, with each player's record behind it. */
export const LiveTeamBoard = ({
  board,
  lobby,
  rankAssets,
}: LiveTeamBoardProps) => {
  const { t } = useTranslation();
  const [side, setSide] = useState<"friendly" | "enemy">("friendly");
  const team = side === "friendly" ? board.team : otherTeam(board.team);
  const color = teamColor(team);
  const players = useMemo(() => [...board[side]].sort(bySouls), [side, board]);
  const most = Math.max(1, ...players.map(({ player }) => player.souls ?? 0));

  const switcher = (
    <div className='flex shrink-0 gap-0.5 rounded-[9px] border bg-background p-[3px]'>
      {(["friendly", "enemy"] as const).map((key) => {
        const value = key === "friendly" ? board.team : otherTeam(board.team);
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
          ? t("stats.live.labels.yourTeam")
          : t("stats.live.labels.enemyTeam")
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
            <span>{t("stats.live.labels.onHero")}</span>
            <span>{t("stats.live.board.allHeroes")}</span>
            <span>{t("stats.live.labels.rank")}</span>
          </div>

          {players.length === 0 && (
            <span className='py-6 text-center text-muted-foreground text-sm'>
              {t("stats.live.teamPending")}
            </span>
          )}
          {players.map((entry, index) => (
            <BoardRow
              color={color}
              entry={entry}
              key={playerKey(entry, index)}
              lobby={lobby}
              most={most}
              rankAssets={rankAssets}
              separated={index > 0 && !players[index - 1]?.player.isLocal}
            />
          ))}

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
                {formatKda(
                  teamTotal(players, "kills"),
                  teamTotal(players, "deaths"),
                  teamTotal(players, "assists"),
                )}
              </span>
              <span className='w-11 text-right'>
                {formatThousands(teamTotal(players, "souls"))}
              </span>
              <span className='text-right'>
                {formatWhole(teamTotal(players, "objectiveDamage"))}
              </span>
            </div>
          )}
        </div>
      </div>
    </LivePanel>
  );
};

const BoardRow = ({
  entry,
  color,
  most,
  separated,
  lobby,
  rankAssets,
}: {
  entry: ResolvedPlayer;
  color: string;
  /** The most souls on the team, which fills the souls bar. */
  most: number;
  /** Draw the hairline above; not under your own highlighted row. */
  separated: boolean;
  lobby: LiveLobby;
  rankAssets: RankAsset[];
}) => {
  const { t } = useTranslation();
  const { player, hero } = entry;
  const { record, onHero, badge } = lobbyEntryOf(lobby, entry);
  return (
    <LivePlayerRow
      className={cn(
        COLUMNS,
        "px-[9px] py-2 text-[13px] leading-[17px]",
        separated && "border-t-foreground/[0.03]",
        player.isDead && "opacity-55",
      )}
      color={color}
      isLocal={player.isLocal}>
      <div className='flex min-w-0 items-center gap-[11px]'>
        <LiveHeroAvatar
          className='h-[34px] w-[34px]'
          entry={entry}
          radius='rounded-[9px]'
          ring={player.isLocal ? color : undefined}
        />
        <div className='flex min-w-0 flex-col gap-0.5'>
          <span className='flex items-center gap-1.5 leading-[17px]'>
            <span className='truncate font-semibold'>{player.name}</span>
            {player.isLocal && (
              <span
                className='shrink-0 rounded px-1.5 font-bold text-[10px] leading-[13px]'
                style={{ backgroundColor: tint(color, 15), color }}>
                {t("stats.live.labels.you")}
              </span>
            )}
            {player.isDead && (
              <span
                className='flex shrink-0 items-center gap-1 text-[10.5px]'
                style={{ color: DANGER_COLOR }}>
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
        {formatKda(player.kills, player.deaths, player.assists)}
      </span>
      <span className='flex items-center gap-2.5'>
        <span className='w-11 shrink-0 text-right font-mono font-semibold tabular-nums'>
          {player.souls === null ? "–" : formatThousands(player.souls)}
        </span>
        <Meter
          className='h-1.5 flex-1'
          color={player.isLocal ? color : tint(color, 45)}
          value={(player.souls ?? 0) / most}
        />
      </span>
      <span className='text-right font-mono tabular-nums'>
        {player.objectiveDamage === null
          ? "–"
          : formatWhole(player.objectiveDamage)}
      </span>
      <span className='flex items-center gap-2 text-xs leading-4'>
        {onHero ? (
          <>
            {t("stats.live.labels.games", { count: onHero.matches })}
            <WinratePill record={onHero} />
          </>
        ) : (
          <span className='text-muted-foreground'>
            {record
              ? t("stats.live.labels.firstGame")
              : t("stats.live.labels.noRecord")}
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
        <UnrankedTag label={t("stats.live.labels.unranked")} />
      ) : (
        <RankTag badge={badge} className='leading-4' rankAssets={rankAssets} />
      )}
    </LivePlayerRow>
  );
};
