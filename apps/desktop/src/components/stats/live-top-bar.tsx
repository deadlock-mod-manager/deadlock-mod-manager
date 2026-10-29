import { Skull } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { tint } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import {
  otherTeam,
  PANEL_CLASS,
  teamColor,
  teamName,
} from "@/components/stats/live-parts";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { formatThousands } from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import type { LiveScoreboardPlayer } from "@/types/generated/LiveScoreboardPlayer";
import type { Team } from "@/types/generated/Team";

interface LiveTopBarProps {
  friendly: LiveScoreboardPlayer[];
  enemy: LiveScoreboardPlayer[];
  friendlyTeam: Team;
  heroFor: (player: LiveScoreboardPlayer) => DeadlockHero | undefined;
}

const total = (
  players: LiveScoreboardPlayer[],
  valueOf: (player: LiveScoreboardPlayer) => number | null,
) => players.reduce((sum, player) => sum + (valueOf(player) ?? 0), 0);

const Heroes = ({
  players,
  color,
  heroFor,
}: {
  players: LiveScoreboardPlayer[];
  color: string;
  heroFor: LiveTopBarProps["heroFor"];
}) => (
  <div className='flex gap-2'>
    {players.map((player, index) => {
      const hero = heroFor(player);
      return (
        <div
          className={cn(
            "flex flex-col items-center gap-1",
            player.isDead && "opacity-45",
          )}
          // The top bar lists each player once per team; names can repeat.
          key={`${player.name}-${index}`}
          title={player.name}>
          <div className='relative flex'>
            <HeroAvatar
              className='h-10 w-10 rounded-[10px] border border-foreground/[0.08]'
              hero={hero}
              heroId={hero?.id ?? player.heroId ?? 0}
            />
            {player.isLocal && (
              <span
                className='pointer-events-none absolute inset-0 rounded-[10px] border-2'
                style={{ borderColor: color }}
              />
            )}
            {player.isDead && (
              <Skull className='absolute inset-0 m-auto h-4 w-4 text-foreground' />
            )}
          </div>
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
export const LiveTopBar = ({
  friendly,
  enemy,
  friendlyTeam,
  heroFor,
}: LiveTopBarProps) => {
  const { t } = useTranslation();
  const ours = total(friendly, (player) => player.souls);
  const theirs = total(enemy, (player) => player.souls);
  const lead = ours - theirs;
  const share = ours + theirs > 0 ? ours / (ours + theirs) : 0.5;
  const enemyTeam = otherTeam(friendlyTeam);
  const [left, right] = [teamColor(friendlyTeam), teamColor(enemyTeam)];
  const leader = lead >= 0 ? left : right;

  return (
    <div
      className={cn(
        PANEL_CLASS,
        "flex items-center gap-[22px] px-[21px] py-[15px]",
      )}>
      <Heroes color={left} heroFor={heroFor} players={friendly} />
      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <div className='flex items-end justify-between'>
          <div className='flex flex-col'>
            <span
              className='font-bold text-[10px] uppercase leading-[13px] tracking-[0.1em]'
              style={{ color: left }}>
              {t(teamName(friendlyTeam))}
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
                souls: `${lead >= 0 ? "+" : "−"}${formatThousands(Math.abs(lead))}`,
              })}
            </span>
            <span className='text-[11px] text-muted-foreground leading-[14px] tabular-nums'>
              {t("stats.live.topBar.kills", {
                ours: total(friendly, (player) => player.kills),
                theirs: total(enemy, (player) => player.kills),
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
        <div className='flex h-2 gap-[3px]'>
          <span
            className='rounded-l'
            style={{
              width: `${share * 100}%`,
              backgroundImage: `linear-gradient(90deg, ${tint(left, 35)}, ${left})`,
            }}
          />
          <span
            className='flex-1 rounded-r'
            style={{
              backgroundImage: `linear-gradient(90deg, ${right}, ${tint(right, 35)})`,
            }}
          />
        </div>
      </div>
      <Heroes color={right} heroFor={heroFor} players={enemy} />
    </div>
  );
};
