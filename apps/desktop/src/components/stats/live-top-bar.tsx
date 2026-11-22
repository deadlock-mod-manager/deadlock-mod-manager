import { Skull } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { tint } from "@/components/stats/chart-fx";
import { PANEL_CLASS, SplitBar } from "@/components/stats/live-parts";
import { LiveHeroAvatar, playerKey } from "@/components/stats/live-player";
import { formatSignedThousands, formatThousands } from "@/lib/stats/format";
import {
  otherTeam,
  type ResolvedBoard,
  type ResolvedPlayer,
  teamColor,
  teamName,
  teamTotal,
} from "@/lib/stats/live-teams";
import { cn } from "@/lib/utils";

const Heroes = ({
  players,
  color,
}: {
  players: ResolvedPlayer[];
  color: string;
}) => (
  <div className='flex gap-2'>
    {players.map((entry, index) => {
      const { player } = entry;
      return (
        <div
          className={cn(
            "flex flex-col items-center gap-1",
            player.isDead && "opacity-45",
          )}
          key={playerKey(entry, index)}
          title={player.name}>
          <LiveHeroAvatar
            className='h-10 w-10'
            entry={entry}
            frameClassName='relative flex'
            radius='rounded-[10px]'
            ring={player.isLocal ? color : undefined}
            ringClassName='border-2'>
            {player.isDead && (
              <Skull className='absolute inset-0 m-auto h-4 w-4 text-foreground' />
            )}
          </LiveHeroAvatar>
          <span
            className='font-mono font-semibold text-[10.5px] text-muted-foreground leading-[14px] tabular-nums'
            style={player.isLocal ? { color } : undefined}>
            {player.level ?? "–"}
          </span>
        </div>
      );
    })}
  </div>
);

/** Both teams the way the in-game top bar shows them, with the souls race between. */
export const LiveTopBar = ({ board }: { board: ResolvedBoard }) => {
  const { t } = useTranslation();
  const { friendly, enemy } = board;
  const ours = teamTotal(friendly, "souls");
  const theirs = teamTotal(enemy, "souls");
  const lead = ours - theirs;
  const share = ours + theirs > 0 ? ours / (ours + theirs) : 0.5;
  const enemyTeam = otherTeam(board.team);
  const [left, right] = [teamColor(board.team), teamColor(enemyTeam)];
  const leader = lead >= 0 ? left : right;

  return (
    <div
      className={cn(
        PANEL_CLASS,
        "flex items-center gap-[22px] px-[21px] py-[15px]",
      )}>
      <Heroes color={left} players={friendly} />
      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <div className='flex items-end justify-between'>
          <div className='flex flex-col'>
            <span
              className='font-bold text-[10px] uppercase leading-[13px] tracking-[0.1em]'
              style={{ color: left }}>
              {t(teamName(board.team))}
            </span>
            <span className='font-bold font-mono text-xl leading-[26px] tabular-nums'>
              {formatThousands(ours)}
            </span>
          </div>
          <div className='flex flex-col items-center gap-0.5'>
            <span
              className='rounded-full px-[9px] py-[3px] font-bold font-mono text-[11.5px] leading-[15px] tabular-nums'
              style={{ backgroundColor: tint(leader, 14), color: leader }}>
              {t("stats.live.topBar.lead", {
                souls: formatSignedThousands(lead),
              })}
            </span>
            <span className='text-[11px] text-muted-foreground leading-[14px] tabular-nums'>
              {t("stats.live.topBar.kills", {
                ours: teamTotal(friendly, "kills"),
                theirs: teamTotal(enemy, "kills"),
              })}
            </span>
          </div>
          <div className='flex flex-col items-end'>
            <span
              className='font-bold text-[10px] uppercase leading-[13px] tracking-[0.1em]'
              style={{ color: right }}>
              {t(teamName(enemyTeam))}
            </span>
            <span className='font-bold font-mono text-xl leading-[26px] tabular-nums'>
              {formatThousands(theirs)}
            </span>
          </div>
        </div>
        <SplitBar
          left={`linear-gradient(90deg, ${tint(left, 35)}, ${left})`}
          right={`linear-gradient(90deg, ${right}, ${tint(right, 35)})`}
          share={share}
          variant='race'
        />
      </div>
      <Heroes color={right} players={enemy} />
    </div>
  );
};
