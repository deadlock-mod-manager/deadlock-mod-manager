import { Button } from "@deadlock-mods/ui/components/button";
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
import {
  ChartLine,
  ChevronRight,
  ExternalLink,
  List,
} from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayerAvatar } from "@/components/stats/account-switcher";
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
import { rankProgress } from "@/lib/stats/rank";

interface PlayerDialogProps {
  /** Whose card to show. `null` closes the dialog. */
  accountId: number | null;
  profile: SteamProfile | undefined;
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
  seed?: PlayerCardSeed;
  onOpenChange: (open: boolean) => void;
}

type DialogTab = "overview" | "matches";
/**
 * Every bit of card state, tagged with whose card it is. The dialog stays mounted
 * between players - the squad tab keeps it around and swaps the account - so state
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
          <DialogHeader className='shrink-0 px-6 pt-6 pb-4'>
            <DialogTitle className='flex items-center gap-3.5 pr-10'>
              <PlayerAvatar
                className='h-[52px] w-[52px] ring-1 ring-border'
                name={profile?.personaname ?? ""}
                profile={profile}
              />
              <div className='min-w-0 flex-1'>
                <div className='truncate font-bold text-xl tracking-tight'>
                  {profile?.personaname ?? `#${accountId}`}
                </div>
                <div className='mt-1 flex flex-wrap items-center gap-3 font-normal text-xs'>
                  {/* The badge is a doorway, not a label: the ranking system
                      tracks progress, placements and demotion protection that a
                      tier name cannot show. */}
                  <button
                    className='group -mx-1 flex items-center gap-1.5 rounded px-1 font-semibold text-foreground/85 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    onClick={() => update({ isRankOpen: true })}
                    type='button'>
                    {badge.image && (
                      <img
                        alt=''
                        className='h-4 w-5 object-contain'
                        src={badge.image}
                      />
                    )}
                    <span>{badge.name ?? t("stats.unranked")}</span>
                    {badge.subrank > 0 && <span>{badge.subrank}</span>}
                    {progress && (
                      <span className='font-normal text-muted-foreground tabular-nums'>
                        {t("stats.rank.progressShort", {
                          percent: Math.round(progress.fraction * 100),
                        })}
                      </span>
                    )}
                    <ChevronRight className='h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
                  </button>
                  <span className='font-mono text-muted-foreground/80'>
                    {accountId}
                  </span>
                </div>
              </div>
              {profile?.profileurl && (
                <Button
                  className='h-8 shrink-0 gap-1.5 font-semibold'
                  onClick={() => void openUrl(profile.profileurl)}
                  size='sm'
                  variant='outline'>
                  <ExternalLink className='h-3.5 w-3.5 text-muted-foreground' />
                  {t("stats.player.steamProfile")}
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          <Tabs
            className='flex min-h-0 flex-1 flex-col'
            onValueChange={(value) =>
              update({ tab: value === "matches" ? "matches" : "overview" })
            }
            value={activeView.tab}>
            <TabsList className='h-auto w-full shrink-0 justify-start gap-1 rounded-none border-border/60 border-b bg-transparent px-6 pt-0 pb-3'>
              {(
                [
                  ["overview", ChartLine, "stats.player.overview"],
                  ["matches", List, "stats.player.matches"],
                ] as const
              ).map(([value, Icon, label]) => (
                <TabsTrigger
                  className='h-9 gap-2 rounded-lg border border-transparent px-3.5 font-semibold text-[13px] text-muted-foreground data-[state=active]:border-primary/15 data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=active]:shadow-none [&[data-state=active]>svg]:text-primary'
                  key={value}
                  value={value}>
                  <Icon className='h-4 w-4' />
                  {t(label)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent
              className='m-0 min-h-0 flex-1 overflow-y-auto'
              value='overview'>
              <PlayerCareerOverview
                heroStats={card.heroStats}
                heroesById={heroesById}
                isHeroStatsPending={card.isHeroStatsPending}
                isPending={card.isPending}
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
