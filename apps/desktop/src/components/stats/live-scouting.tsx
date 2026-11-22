import { Hourglass } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { tint, WARN_COLOR } from "@/components/stats/chart-fx";
import { PANEL_CLASS, SplitBar } from "@/components/stats/live-parts";
import { ScoutingMatchups } from "@/components/stats/live-scouting-matchups";
import { ScoutingTeam } from "@/components/stats/live-scouting-team";
import { type RankAsset, rankLabel } from "@/lib/stats/api";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
  formatThousands,
} from "@/lib/stats/format";
import {
  type LiveLobby,
  type TeamScouting,
  teamScouting,
} from "@/lib/stats/live-lobby";
import {
  otherTeam,
  type ResolvedBoard,
  teamColor,
} from "@/lib/stats/live-teams";
import { cn } from "@/lib/utils";

interface LiveScoutingProps {
  board: ResolvedBoard;
  lobby: LiveLobby;
  rankAssets: RankAsset[];
}

/** One number for both teams, the higher side in its team colour. */
const Comparison = ({
  label,
  ours,
  theirs,
  format,
  left,
  right,
  wide,
}: {
  label: string;
  ours: number | null;
  theirs: number | null;
  format: (value: number) => string;
  left: string;
  right: string;
  wide: boolean;
}) => {
  const both = ours !== null && theirs !== null;
  const share = both ? ours / Math.max(ours + theirs, 1) : 0.5;
  const ahead = both && ours > theirs;
  const behind = both && ours < theirs;
  return (
    <div
      className={cn("flex flex-col gap-1.5", wide ? "w-[240px]" : "w-[150px]")}>
      <span className='font-semibold text-[10px] text-muted-foreground/75 uppercase leading-[13px] tracking-[0.8px]'>
        {label}
      </span>
      <span className='flex justify-between gap-3 font-bold font-mono text-[14px] leading-[18px] tabular-nums'>
        <span style={ahead ? { color: left } : undefined}>
          {ours === null ? "–" : format(ours)}
        </span>
        <span style={behind ? { color: right } : undefined}>
          {theirs === null ? "–" : format(theirs)}
        </span>
      </span>
      <SplitBar
        left={ahead ? left : tint(left, 35)}
        right={behind ? right : tint(right, 35)}
        share={share}
        variant='compare'
      />
    </div>
  );
};

const ScoutingHeader = ({ board, lobby, rankAssets }: LiveScoutingProps) => {
  const { t } = useTranslation();
  const ours = teamScouting(lobby, board.friendly);
  const theirs = teamScouting(lobby, board.enemy);
  const [left, right] = [
    teamColor(board.team),
    teamColor(otherTeam(board.team)),
  ];
  const comparisons: {
    key: keyof TeamScouting;
    format: (value: number) => string;
  }[] = [
    {
      key: "rank",
      format: (value) =>
        rankLabel(value, rankAssets) ?? formatDecimal(value, 0),
    },
    { key: "onHero", format: (value) => formatCompact(Math.round(value)) },
    { key: "winrate", format: (value) => formatPercent(value, 0) },
    { key: "matches", format: (value) => formatThousands(value) },
  ];

  return (
    <div
      className={cn(
        PANEL_CLASS,
        "flex flex-wrap items-center gap-x-6 gap-y-4 px-[23px] py-[17px]",
      )}
      style={{
        backgroundImage: `linear-gradient(90deg, ${tint(left, 8)}, transparent 40%, transparent 60%, ${tint(right, 8)})`,
      }}>
      <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
        <span
          className='flex w-fit items-center gap-1.5 rounded-full px-2 py-[3px] font-bold font-mono text-[11px] uppercase leading-[14px] tracking-[0.4px]'
          style={{ backgroundColor: tint(WARN_COLOR, 12), color: WARN_COLOR }}>
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
        {comparisons.map(({ key, format }) => (
          <Comparison
            format={format}
            key={key}
            label={t(`stats.live.scouting.compare.${key}`)}
            left={left}
            ours={ours[key]}
            right={right}
            theirs={theirs[key]}
            wide={key === "rank"}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Everyone in the lobby before the zipline: both teams with each player's rank,
 * record on the hero they locked and recent form, plus how your hero has done
 * against theirs.
 */
export const LiveScouting = ({
  board,
  lobby,
  rankAssets,
}: LiveScoutingProps) => {
  const you = board.friendly.find(({ player }) => player.isLocal);
  const enemyHeroes = board.enemy.flatMap(({ hero }) => hero ?? []);

  return (
    <div className='flex flex-col gap-4'>
      <ScoutingHeader board={board} lobby={lobby} rankAssets={rankAssets} />
      <div className='grid gap-4 xl:grid-cols-2'>
        <ScoutingTeam
          isEnemy={false}
          lobby={lobby}
          players={board.friendly}
          rankAssets={rankAssets}
          team={board.team}
        />
        <ScoutingTeam
          isEnemy
          lobby={lobby}
          players={board.enemy}
          rankAssets={rankAssets}
          team={otherTeam(board.team)}
        />
      </div>
      {you?.hero && (
        <ScoutingMatchups
          enemyHeroes={enemyHeroes}
          hero={you.hero}
          records={lobby.matchups}
        />
      )}
    </div>
  );
};
