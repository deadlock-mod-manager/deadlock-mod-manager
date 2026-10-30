import { useTranslation } from "react-i18next";
import { DANGER_COLOR, tint } from "@/components/stats/chart-fx";
import { GradePill, PANEL_CLASS, RankTag } from "@/components/stats/live-parts";
import { LiveHeroAvatar } from "@/components/stats/live-player";
import type { RankAsset } from "@/lib/stats/api";
import {
  formatDecimal,
  formatKda,
  formatPercent,
  formatWhole,
} from "@/lib/stats/format";
import type { Grade } from "@/lib/stats/live-grades";
import { type CareerRecord, winrateOf } from "@/lib/stats/live-lobby";
import {
  type ResolvedPlayer,
  teamColor,
  teamName,
} from "@/lib/stats/live-teams";
import { cn } from "@/lib/utils";
import type { Team } from "@/types/generated/Team";

interface LiveNowStripProps {
  you: ResolvedPlayer;
  clock: string | null;
  /** The match has ended and this is its last report. */
  isOver: boolean;
  minutes: number | null;
  team: Team;
  badge: number | undefined;
  rankAssets: RankAsset[];
  onHero: CareerRecord | undefined;
  overall: { beats: number; grade: Grade } | null;
  bracketName: string | null;
}

const Stat = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string | null;
}) => (
  <div className='flex flex-col gap-1'>
    <span className='font-semibold text-[10.5px] text-muted-foreground/75 uppercase leading-[14px] tracking-[0.8px]'>
      {label}
    </span>
    <span className='font-bold font-mono text-2xl leading-[31px] tracking-[-0.5px] tabular-nums'>
      {value}
    </span>
    <span className='text-[11.5px] text-muted-foreground leading-[15px] tabular-nums'>
      {detail ?? " "}
    </span>
  </div>
);

/** You, right now: your hero, your numbers, and one grade for the match so far. */
export const LiveNowStrip = ({
  you,
  clock,
  isOver,
  minutes,
  team,
  badge,
  rankAssets,
  onHero,
  overall,
  bracketName,
}: LiveNowStripProps) => {
  const { t } = useTranslation();
  const { player, hero } = you;
  const accent = teamColor(team);
  const perMinute = (value: number | null) =>
    value === null || !minutes
      ? null
      : t("stats.live.labels.perMinute", {
          value: formatWhole(value / minutes),
        });
  const kda =
    player.kills === null || player.deaths === null || player.assists === null
      ? null
      : (player.kills + player.assists) / Math.max(player.deaths, 1);
  const heroName = hero?.name ?? player.heroName ?? player.name;

  return (
    <div
      className={cn(PANEL_CLASS, "flex items-center gap-7 px-[23px] py-[19px]")}
      style={{
        backgroundImage: `linear-gradient(90deg, ${tint(accent, 12)}, transparent 45%)`,
      }}>
      <div className='flex min-w-0 flex-1 items-center gap-4'>
        <LiveHeroAvatar
          bordered={false}
          className='h-full w-full'
          entry={you}
          frameClassName='relative h-[84px] w-[84px] shrink-0'
          radius='rounded-2xl'
          ring={tint(accent, 40)}>
          {player.level !== null && (
            <span
              className='absolute -right-1.5 -bottom-0.5 flex h-6 w-[34px] items-center justify-center rounded-[7px] border-[1.5px] bg-background font-bold font-mono text-xs tabular-nums'
              style={{ borderColor: accent }}>
              {player.level}
            </span>
          )}
        </LiveHeroAvatar>
        <div className='flex min-w-0 flex-col gap-1.5'>
          <div className='flex items-center gap-1.5'>
            {isOver ? (
              <span className='rounded-full bg-foreground/[0.07] px-2 py-[3px] font-bold font-mono text-[11px] text-muted-foreground leading-[14px] tracking-[0.4px]'>
                {t("stats.live.now.finalAt", { clock: clock ?? "" })}
              </span>
            ) : (
              <span
                className='flex items-center gap-1.5 rounded-full px-2 py-[3px] font-bold font-mono text-[11px] leading-[14px] tracking-[0.4px]'
                style={{
                  backgroundColor: tint(DANGER_COLOR, 12),
                  color: DANGER_COLOR,
                }}>
                <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-current' />
                {clock
                  ? t("stats.live.now.liveAt", { clock })
                  : t("stats.tabs.live")}
              </span>
            )}
            <span
              className='rounded-full px-2 py-[3px] font-semibold text-[11px] leading-[14px]'
              style={{ backgroundColor: tint(accent, 12), color: accent }}>
              {t(teamName(team))}
            </span>
          </div>
          <span className='truncate font-bold text-[28px] leading-9 tracking-[-0.4px]'>
            {heroName}
          </span>
          <div className='flex items-center gap-2.5 text-[12.5px] text-muted-foreground leading-4'>
            <span className='truncate text-foreground'>{player.name}</span>
            {badge !== undefined && (
              <>
                <span className='h-3 w-px shrink-0 bg-border' />
                <RankTag
                  badge={badge}
                  className='text-[12.5px]'
                  rankAssets={rankAssets}
                />
              </>
            )}
            {onHero && (
              <>
                <span className='h-3 w-px shrink-0 bg-border' />
                <span className='shrink-0'>
                  {t("stats.live.now.onHero", {
                    winrate: formatPercent(winrateOf(onHero), 0),
                    hero: heroName,
                  })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className='flex items-center gap-9 px-2'>
        <Stat
          detail={perMinute(player.souls)}
          label={t("stats.live.now.souls")}
          value={player.souls === null ? "–" : formatWhole(player.souls)}
        />
        <Stat
          detail={
            kda === null
              ? null
              : t("stats.live.now.kda", { value: formatDecimal(kda, 1) })
          }
          label={t("stats.live.labels.kda")}
          value={formatKda(player.kills, player.deaths, player.assists)}
        />
        <Stat
          detail={perMinute(player.objectiveDamage)}
          label={t("stats.live.now.objective")}
          value={
            player.objectiveDamage === null
              ? "–"
              : formatWhole(player.objectiveDamage)
          }
        />
      </div>

      {overall && (
        <>
          <span className='h-[72px] w-px shrink-0 bg-border' />
          <div className='flex items-center gap-4'>
            <GradePill grade={overall.grade} size='xl' />
            <div className='flex w-[173px] flex-col gap-1'>
              <span className='font-medium text-[13px] leading-[17px]'>
                {isOver
                  ? t("stats.live.now.final")
                  : t("stats.live.now.overall")}
              </span>
              <span className='text-muted-foreground text-xs leading-4'>
                {t("stats.live.now.overallDetail", {
                  share: formatPercent(overall.beats, 0),
                  bracket: bracketName
                    ? `${bracketName} ${heroName}`
                    : heroName,
                  clock: clock ?? "",
                })}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
