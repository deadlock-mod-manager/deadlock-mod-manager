import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Flag,
  Hammer,
  LayoutDashboard,
  Swords,
  Timer,
  Users,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LOSS_COLOR, WIN_COLOR } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchMetadata, MatchMetadataPlayer } from "@/lib/stats/api";
import {
  formatClock,
  formatCompact,
  formatDateTime,
  formatDecimal,
} from "@/lib/stats/format";

const MATCH_VIEWS = ["overview", "build", "lobby"] as const;
export type MatchView = (typeof MATCH_VIEWS)[number];

export const isMatchView = (value: string | null): value is MatchView =>
  MATCH_VIEWS.some((view) => view === value);

const VIEW_ICONS = {
  overview: LayoutDashboard,
  build: Hammer,
  lobby: Users,
} satisfies Record<MatchView, typeof Users>;

export interface RankChange {
  steps: number;
  from: string;
  to: string;
}

interface MatchHeaderProps {
  match: MatchMetadata["match_info"];
  me: MatchMetadataPlayer;
  hero: DeadlockHero | undefined;
  damageRank: number | null;
  rankChange: RankChange | null;
  view: MatchView;
  onViewChange: (view: MatchView) => void;
  previousId: number | null;
  nextId: number | null;
}

const LineFigure = ({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) => (
  <div className='flex flex-col gap-1 border-border/70 border-l px-5 first:border-l-0 sm:first:border-l'>
    <span className='font-semibold text-[10.5px] text-muted-foreground uppercase tracking-[0.12em]'>
      {label}
    </span>
    <span
      className='font-bold font-mono text-[22px] leading-none tabular-nums'
      style={{ color: tone }}>
      {value}
    </span>
    <span className='text-[11.5px] text-muted-foreground'>{hint}</span>
  </div>
);

/** Where the match sits in the history, how it ended, and the player's line. */
export const MatchHeader = ({
  match,
  me,
  hero,
  damageRank,
  rankChange,
  view,
  onViewChange,
  previousId,
  nextId,
}: MatchHeaderProps) => {
  const { t, i18n } = useTranslation();
  const won = match.winning_team === me.team;
  const minutes = match.duration_s / 60;
  const damage = me.stats[me.stats.length - 1]?.player_damage ?? 0;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(String(match.match_id));
      toast.success(t("stats.match.copied"));
    } catch {
      toast.error(t("stats.match.copyFailed"));
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <nav
          aria-label={t("stats.match.breadcrumb")}
          className='flex min-w-0 items-center gap-2 text-sm'>
          <Button
            asChild
            className='h-8 gap-1.5 px-2.5'
            size='sm'
            variant='outline'>
            <Link to='/stats'>
              <ArrowLeft className='h-3.5 w-3.5' />
              {t("stats.title")}
            </Link>
          </Button>
          <ChevronRight
            aria-hidden
            className='h-3.5 w-3.5 text-muted-foreground/60'
          />
          <span className='font-mono font-medium'>
            {t("stats.match.matchId", { id: match.match_id })}
          </span>
        </nav>
        <div className='flex items-center gap-2'>
          <Button
            className='h-8 gap-1.5'
            onClick={copyId}
            size='sm'
            variant='outline'>
            <Copy className='h-3.5 w-3.5' />
            {t("stats.match.copyId")}
          </Button>
          {(
            [
              [previousId, ChevronLeft, "stats.match.previous"],
              [nextId, ChevronRight, "stats.match.next"],
            ] as const
          ).map(([id, Icon, label]) =>
            id === null ? (
              <Button
                aria-label={t(label)}
                className='h-8 w-8'
                disabled
                key={label}
                size='icon'
                variant='outline'>
                <Icon className='h-4 w-4' />
              </Button>
            ) : (
              <Button
                asChild
                className='h-8 w-8'
                key={label}
                size='icon'
                title={t(label)}
                variant='outline'>
                <Link
                  aria-label={t(label)}
                  to={`/stats/matches/${id}?view=${view}`}>
                  <Icon className='h-4 w-4' />
                </Link>
              </Button>
            ),
          )}
        </div>
      </div>

      <Card className='stats-surface flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-6 py-5 shadow-none'>
        <div className='flex min-w-0 items-center gap-4'>
          <HeroAvatar
            className='h-[68px] w-[68px] rounded-2xl border-2'
            hero={hero}
            heroId={me.hero_id}
          />
          <div className='min-w-0'>
            <h1 className='truncate font-bold text-3xl tracking-tight'>
              <span style={{ color: won ? WIN_COLOR : LOSS_COLOR }}>
                {won ? t("stats.match.victory") : t("stats.match.defeat")}
              </span>{" "}
              {t("stats.match.onHero", {
                hero: hero?.name ?? `#${me.hero_id}`,
              })}
            </h1>
            <div className='mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground'>
              <span className='flex items-center gap-1.5'>
                <Swords aria-hidden className='h-3.5 w-3.5' />
                {match.match_mode === 4
                  ? t("stats.scope.ranked")
                  : t("stats.scope.unranked")}
              </span>
              <span className='flex items-center gap-1.5'>
                <Timer aria-hidden className='h-3.5 w-3.5' />
                {formatClock(match.duration_s)}
              </span>
              <span className='flex items-center gap-1.5'>
                <Calendar aria-hidden className='h-3.5 w-3.5' />
                {formatDateTime(match.start_time, i18n.language)}
              </span>
              <span className='flex items-center gap-1.5'>
                <Flag aria-hidden className='h-3.5 w-3.5' />
                {t(`stats.match.teams.${me.team === 0 ? 0 : 1}`)}
              </span>
            </div>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-y-3'>
          <LineFigure
            hint={t("stats.recent.kda", {
              value: formatDecimal(
                (me.kills + me.assists) / Math.max(me.deaths, 1),
                1,
              ),
            })}
            label={t("stats.match.kda")}
            value={`${me.kills} / ${me.deaths} / ${me.assists}`}
          />
          <LineFigure
            hint={t("stats.match.perMinute", {
              value: formatCompact(minutes > 0 ? me.net_worth / minutes : 0),
            })}
            label={t("stats.match.souls")}
            value={formatCompact(me.net_worth)}
          />
          <LineFigure
            hint={
              damageRank === null
                ? "-"
                : t("stats.match.lobbyRank", {
                    count: damageRank,
                    ordinal: true,
                  })
            }
            label={t("stats.match.damage")}
            tone={damageRank === 1 ? "hsl(var(--primary))" : undefined}
            value={formatCompact(damage)}
          />
          {rankChange && (
            <LineFigure
              hint={t("stats.match.rankFromTo", {
                from: rankChange.from,
                to: rankChange.to,
              })}
              label={t("stats.match.rank")}
              tone={
                rankChange.steps > 0
                  ? WIN_COLOR
                  : rankChange.steps < 0
                    ? LOSS_COLOR
                    : undefined
              }
              value={
                rankChange.steps > 0
                  ? `+${rankChange.steps}`
                  : String(rankChange.steps)
              }
            />
          )}
        </div>
      </Card>

      <ToggleGroup
        aria-label={t("stats.match.views")}
        className='justify-start gap-1'
        onValueChange={(value) => {
          if (isMatchView(value)) onViewChange(value);
        }}
        type='single'
        value={view}>
        {MATCH_VIEWS.map((value) => {
          const Icon = VIEW_ICONS[value];
          return (
            <ToggleGroupItem
              className='h-9 gap-2 rounded-lg border border-transparent px-3.5 text-muted-foreground data-[state=on]:border-primary/15 data-[state=on]:bg-secondary data-[state=on]:text-foreground'
              key={value}
              value={value}>
              <Icon className='h-4 w-4' />
              {t(`stats.match.view.${value}`)}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
};
