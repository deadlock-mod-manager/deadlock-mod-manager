import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { useHeroDeepDive } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { HeroCounterStats, PlayerHeroStats } from "@/lib/stats/api";
import {
  formatClock,
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

/** Enough games that the matchup is a record rather than an anecdote. */
const MIN_MATCHUP_GAMES = 3;
const MATCHUPS_PER_SIDE = 5;
const BUILD_ITEMS = 12;

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className='min-w-0 px-4 py-3'>
    <dt className='truncate text-muted-foreground text-[11px]'>{label}</dt>
    <dd className='mt-0.5 truncate font-semibold text-sm tabular-nums'>
      {value}
    </dd>
  </div>
);

const MatchupRow = ({
  matchup,
  hero,
}: {
  matchup: HeroCounterStats;
  hero: DeadlockHero | undefined;
}) => {
  const { t } = useTranslation();
  const winrate = matchup.wins / matchup.matches_played;
  const soulLead = matchup.networth - matchup.enemy_networth;

  return (
    <div className='flex items-center gap-2.5 py-1.5'>
      <HeroAvatar
        className='h-8 w-8 shrink-0'
        hero={hero}
        heroId={matchup.enemy_hero_id}
      />
      <div className='min-w-0 flex-1'>
        <div className='truncate font-medium text-xs'>
          {hero?.name ?? `#${matchup.enemy_hero_id}`}
        </div>
        <div className='truncate text-[11px] text-muted-foreground tabular-nums'>
          {t("stats.hero.record", {
            wins: matchup.wins,
            losses: matchup.matches_played - matchup.wins,
          })}
          {" · "}
          {t("stats.hero.soulLead", {
            souls: `${soulLead >= 0 ? "+" : "-"}${formatCompact(Math.abs(soulLead / matchup.matches_played))}`,
          })}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 font-semibold text-xs tabular-nums",
          winrate >= 0.5 ? "text-emerald-500" : "text-destructive",
        )}>
        {formatPercent(winrate, 0)}
      </span>
    </div>
  );
};

interface HeroDeepDiveProps {
  accountId: number | null;
  /** The hero to analyse; `null` closes the dialog. */
  heroId: number | null;
  heroesById: Map<number, DeadlockHero>;
  /** The player's own aggregate on this hero, when the caller already has it. */
  heroStats?: PlayerHeroStats;
  onOpenChange: (open: boolean) => void;
}

/**
 * One hero, in depth: who the player actually beats on it and what they build.
 * Both come from analytics scoped to the account, so this is their record rather
 * than the global meta - and both are fetched only once the card is opened.
 */
export const HeroDeepDive = ({
  accountId,
  heroId,
  heroesById,
  heroStats,
  onOpenChange,
}: HeroDeepDiveProps) => {
  const { t } = useTranslation();
  const dive = useHeroDeepDive(accountId, heroId);
  const hero = heroId === null ? undefined : heroesById.get(heroId);

  const { best, worst } = useMemo(() => {
    const winrateOf = (entry: HeroCounterStats) =>
      entry.wins / entry.matches_played;
    const ranked = dive.matchups
      .filter((entry) => entry.matches_played >= MIN_MATCHUP_GAMES)
      .sort((a, b) => winrateOf(b) - winrateOf(a));
    const best = ranked.slice(0, MATCHUPS_PER_SIDE);
    return {
      best,
      // Starting no earlier than where `best` ends keeps a hero off both lists
      // when there are fewer than ten matchups to go around.
      worst: ranked
        .slice(Math.max(ranked.length - MATCHUPS_PER_SIDE, best.length))
        .sort((a, b) => winrateOf(a) - winrateOf(b)),
    };
  }, [dive.matchups]);

  const build = dive.build.slice(0, BUILD_ITEMS);

  if (heroId === null) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className='max-h-[85vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-3'>
            <HeroAvatar className='h-10 w-10' hero={hero} heroId={heroId} />
            <span>{hero?.name ?? `#${heroId}`}</span>
          </DialogTitle>
          <DialogDescription>
            {t("stats.hero.deepDiveDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          {heroStats && heroStats.matches_played > 0 && (
            <dl className='grid grid-cols-2 divide-x divide-y rounded-lg border sm:grid-cols-4'>
              <Figure
                label={t("stats.heroes.matches")}
                value={String(heroStats.matches_played)}
              />
              <Figure
                label={t("stats.heroes.winrate")}
                value={formatPercent(
                  heroStats.wins / heroStats.matches_played,
                  0,
                )}
              />
              <Figure
                label={t("stats.heroes.kda")}
                value={formatDecimal(
                  (heroStats.kills + heroStats.assists) /
                    Math.max(heroStats.deaths, 1),
                )}
              />
              <Figure
                label={t("stats.heroes.souls")}
                value={formatCompact(heroStats.networth_per_min)}
              />
            </dl>
          )}

          {dive.isPending ? (
            <div className='space-y-4'>
              <Skeleton className='h-40 w-full rounded-lg' />
              <Skeleton className='h-28 w-full rounded-lg' />
            </div>
          ) : (
            <>
              {best.length > 0 && (
                <div className='grid gap-6 sm:grid-cols-2'>
                  <section>
                    <h3 className='mb-1 font-semibold text-sm'>
                      {t("stats.hero.strongAgainst")}
                    </h3>
                    <div className='divide-y'>
                      {best.map((matchup) => (
                        <MatchupRow
                          hero={heroesById.get(matchup.enemy_hero_id)}
                          key={matchup.enemy_hero_id}
                          matchup={matchup}
                        />
                      ))}
                    </div>
                  </section>
                  {worst.length > 0 && (
                    <section>
                      <h3 className='mb-1 font-semibold text-sm'>
                        {t("stats.hero.weakAgainst")}
                      </h3>
                      <div className='divide-y'>
                        {worst.map((matchup) => (
                          <MatchupRow
                            hero={heroesById.get(matchup.enemy_hero_id)}
                            key={matchup.enemy_hero_id}
                            matchup={matchup}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {build.length > 0 ? (
                <section>
                  <h3 className='font-semibold text-sm'>
                    {t("stats.hero.buildTitle")}
                  </h3>
                  <p className='mb-2 text-muted-foreground text-xs'>
                    {t("stats.hero.buildDescription")}
                  </p>
                  <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                    {build.map((item) => {
                      const asset = dive.itemsById.get(item.item_id);
                      const image = asset?.shop_image_webp ?? asset?.shop_image;
                      return (
                        <Tooltip key={item.item_id}>
                          <TooltipTrigger asChild>
                            <div className='flex min-w-0 items-center gap-2 rounded-md border p-1.5'>
                              {image ? (
                                <img
                                  alt=''
                                  className='h-8 w-8 shrink-0 rounded object-cover'
                                  src={image}
                                />
                              ) : (
                                <span className='h-8 w-8 shrink-0 rounded bg-muted' />
                              )}
                              <div className='min-w-0 flex-1'>
                                <div className='truncate font-medium text-xs'>
                                  {asset?.name ?? `#${item.item_id}`}
                                </div>
                                <div className='truncate text-[11px] text-muted-foreground tabular-nums'>
                                  {formatPercent(item.wins / item.matches, 0)}
                                  {" · "}
                                  {formatClock(item.avg_buy_time_s)}
                                </div>
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("stats.hero.buildTooltip", {
                              matches: item.matches,
                              winrate: formatPercent(
                                item.wins / item.matches,
                                0,
                              ),
                              time: formatClock(item.avg_buy_time_s),
                            })}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {t("stats.hero.noData")}
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
