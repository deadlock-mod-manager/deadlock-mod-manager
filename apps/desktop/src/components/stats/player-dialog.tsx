import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import { ChevronRight, History } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { HeroDeepDive } from "@/components/stats/hero-deep-dive";
import { PlayerCareerOverview } from "@/components/stats/player-career-overview";
import { PlayerMatchExplorer } from "@/components/stats/player-match-explorer";
import { RankDeepDive } from "@/components/stats/rank-deep-dive";
import { type PlayerCardSeed, usePlayerCard } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import {
  type RankAsset,
  resolveRank,
  type SteamProfile,
} from "@/lib/stats/api";
import { formatPercent } from "@/lib/stats/format";
import type { LivePlayer } from "@/lib/stats/live";
import { rankProgress } from "@/lib/stats/rank";

interface PlayerDialogProps {
  /** Whose card to show. `null` closes the dialog. */
  accountId: number | null;
  profile: SteamProfile | undefined;
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
  seed?: PlayerCardSeed;
  onOpenChange: (open: boolean) => void;
  /** The scoreboard row when opened from a running match. */
  live?: LivePlayer | null;
}

type DialogTab = "overview" | "matches";
/**
 * Every bit of card state, tagged with whose card it is. The dialog stays mounted
 * between players - the live tab keeps it around and swaps the account - so state
 * held loose would follow one player's card into the next one's.
 */
type DialogView = {
  accountId: number;
  tab: DialogTab;
  matchId: number | null;
  /** Narrows the match list to one hero; null shows every match. */
  heroFilter: number | null;
  isRankOpen: boolean;
  /** The hero whose breakdown is open, if any. */
  divedHero: number | null;
};

const initialView = (accountId: number): DialogView => ({
  accountId,
  tab: "overview",
  matchId: null,
  heroFilter: null,
  isRankOpen: false,
  divedHero: null,
});

/** Career view and on-demand match analysis for one player. */
export const PlayerDialog = ({
  accountId,
  profile,
  heroesById,
  rankAssets,
  seed,
  onOpenChange,
  live,
}: PlayerDialogProps) => {
  const { t } = useTranslation();
  const card = usePlayerCard(accountId, seed);
  const [view, setView] = useState<DialogView | null>(null);

  if (accountId === null) return null;

  const activeView =
    view?.accountId === accountId ? view : initialView(accountId);
  const update = (patch: Partial<DialogView>) =>
    setView({ ...activeView, ...patch });
  const badge = resolveRank(card.rank?.badge, rankAssets);
  const progress = rankProgress(card.rank ?? null);
  const hero = live ? heroesById.get(live.heroId) : undefined;
  const onCurrentHero = live
    ? card.heroStats.find((entry) => entry.hero_id === live.heroId)
    : undefined;
  const selectedMatchId =
    activeView.matchId ?? card.matches[0]?.match_id ?? null;

  /**
   * The career view can hand over a match on any hero, so a filter left from a
   * hero focus has to give way - otherwise the explorer would drop the match
   * that was just asked for and open an unrelated one instead.
   */
  const selectMatch = (matchId: number) => {
    const match = card.matches.find((entry) => entry.match_id === matchId);
    const keepsFilter =
      activeView.heroFilter === null ||
      match?.hero_id === activeView.heroFilter;
    update({
      tab: "matches",
      matchId,
      heroFilter: keepsFilter ? activeView.heroFilter : null,
    });
  };

  /**
   * Jumps to the match list with only that hero's games in it. The selected
   * match is dropped so the list opens on the newest game on the hero rather
   * than on whatever was picked before.
   */
  const focusHero = (heroId: number | null) => {
    update({ tab: "matches", matchId: null, heroFilter: heroId });
  };

  return (
    <>
      {/* Tagging the state by account is not enough on its own: reopening the
          same player's card would otherwise come back with whatever deep dive
          was on screen when it was closed. */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            update({ isRankOpen: false, divedHero: null });
          }
          onOpenChange(open);
        }}
        open>
        <DialogContent className='flex h-[85vh] max-h-[760px] w-[calc(100vw-2rem)] max-w-[1120px] flex-col gap-0 overflow-hidden p-0'>
          <DialogHeader className='shrink-0 px-5 pt-5 pb-4'>
            <DialogTitle className='flex items-center gap-3 pr-8'>
              <Avatar className='h-12 w-12'>
                {profile?.avatarfull && (
                  <AvatarImage alt='' src={profile.avatarfull} />
                )}
                <AvatarFallback>
                  {profile?.personaname?.charAt(0) ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className='min-w-0'>
                <div className='truncate'>
                  {profile?.personaname ?? `#${accountId}`}
                </div>
                {/* The badge is a doorway, not a label: the ranking system tracks
                    progress, placements and demotion protection that a tier name
                    cannot show. */}
                <button
                  className='group -mx-1 flex items-center gap-1.5 rounded px-1 font-normal text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  onClick={() => update({ isRankOpen: true })}
                  type='button'>
                  {badge.image && (
                    <img
                      alt=''
                      className='h-4 w-4 object-contain'
                      src={badge.image}
                    />
                  )}
                  <span>{badge.name ?? t("stats.unranked")}</span>
                  {badge.subrank > 0 && <span>{badge.subrank}</span>}
                  {progress && (
                    <span className='tabular-nums'>
                      {t("stats.rank.progressShort", {
                        percent: Math.round(progress.fraction * 100),
                      })}
                    </span>
                  )}
                  <span aria-hidden>·</span>
                  <span className='tabular-nums'>{accountId}</span>
                  <ChevronRight className='h-3 w-3 transition-transform group-hover:translate-x-0.5' />
                </button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {live && (
            <div className='mx-5 mb-4 flex shrink-0 flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3'>
              <HeroAvatar
                className='h-10 w-10'
                hero={hero}
                heroId={live.heroId}
              />
              <div className='min-w-0 flex-1'>
                <div className='font-medium text-sm'>
                  {hero?.name ?? `#${live.heroId}`}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {onCurrentHero
                    ? t("stats.player.onHero", {
                        matches: onCurrentHero.matches_played,
                        winrate: formatPercent(
                          onCurrentHero.wins / onCurrentHero.matches_played,
                          0,
                        ),
                      })
                    : t("stats.player.firstTimeHero")}
                </div>
              </div>
              {/* The whole point of the live card: they are on a hero right now,
                  and their own games on it are the best read on what comes next. */}
              {onCurrentHero && (
                <button
                  className='flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  onClick={() => focusHero(live.heroId)}
                  type='button'>
                  <History className='h-3.5 w-3.5' aria-hidden />
                  {t("stats.player.reviewHero", {
                    hero: hero?.name ?? `#${live.heroId}`,
                  })}
                </button>
              )}
              <Badge className='shrink-0' variant='secondary'>
                {live.kills}/{live.deaths}/{live.assists}
              </Badge>
            </div>
          )}

          <Tabs
            className='flex min-h-0 flex-1 flex-col'
            onValueChange={(value) =>
              update({ tab: value === "matches" ? "matches" : "overview" })
            }
            value={activeView.tab}>
            <TabsList className='h-11 w-full shrink-0 justify-start rounded-none border-y bg-muted/30 px-5 py-1'>
              <TabsTrigger value='overview'>
                {t("stats.player.overview")}
              </TabsTrigger>
              <TabsTrigger value='matches'>
                {t("stats.player.matches")}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              className='m-0 min-h-0 flex-1 overflow-y-auto'
              value='overview'>
              <PlayerCareerOverview
                heroStats={card.heroStats}
                heroesById={heroesById}
                isHeroStatsPending={card.isHeroStatsPending}
                isPending={card.isPending}
                live={live}
                matches={card.matches}
                onSelectHero={(heroId) => update({ divedHero: heroId })}
                onSelectMatch={selectMatch}
              />
            </TabsContent>
            <TabsContent
              className='m-0 min-h-0 flex-1 overflow-hidden'
              value='matches'>
              <PlayerMatchExplorer
                accountId={accountId}
                heroFilter={activeView.heroFilter}
                heroesById={heroesById}
                matches={card.matches}
                onClearHeroFilter={() => focusHero(null)}
                onSelectHero={(heroId) => update({ divedHero: heroId })}
                onSelectMatch={selectMatch}
                selectedMatchId={selectedMatchId}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <RankDeepDive
        matches={card.matches}
        onOpenChange={(open) => update({ isRankOpen: open })}
        open={activeView.isRankOpen}
        progress={progress}
        rank={card.rank ?? null}
        rankAssets={rankAssets}
      />

      <HeroDeepDive
        accountId={accountId}
        heroId={activeView.divedHero}
        heroStats={card.heroStats.find(
          (entry) => entry.hero_id === activeView.divedHero,
        )}
        heroesById={heroesById}
        onOpenChange={(open) => !open && update({ divedHero: null })}
      />
    </>
  );
};
