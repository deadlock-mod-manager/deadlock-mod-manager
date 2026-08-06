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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { PlayerCareerOverview } from "@/components/stats/player-career-overview";
import { PlayerMatchExplorer } from "@/components/stats/player-match-explorer";
import { type PlayerCardSeed, usePlayerCard } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import {
  type RankAsset,
  resolveRank,
  type SteamProfile,
} from "@/lib/stats/api";
import { formatPercent } from "@/lib/stats/format";
import type { LivePlayer } from "@/lib/stats/live";

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
type DialogView = {
  accountId: number;
  tab: DialogTab;
  matchId: number | null;
};

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
    view?.accountId === accountId
      ? view
      : { accountId, tab: "overview" as const, matchId: null };
  const badge = resolveRank(card.rank?.badge, rankAssets);
  const hero = live ? heroesById.get(live.heroId) : undefined;
  const onCurrentHero = live
    ? card.heroStats.find((entry) => entry.hero_id === live.heroId)
    : undefined;
  const selectedMatchId =
    activeView.matchId ?? card.matches[0]?.match_id ?? null;

  const selectMatch = (matchId: number) => {
    setView({ accountId, tab: "matches", matchId });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
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
              <div className='flex items-center gap-1.5 font-normal text-muted-foreground text-xs'>
                {badge.image && (
                  <img
                    alt=''
                    className='h-4 w-4 object-contain'
                    src={badge.image}
                  />
                )}
                <span>{badge.name ?? t("stats.unranked")}</span>
                {badge.subrank > 0 && <span>{badge.subrank}</span>}
                <span aria-hidden>·</span>
                <span className='tabular-nums'>{accountId}</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {live && (
          <div className='mx-5 mb-4 flex shrink-0 items-center gap-3 rounded-md border bg-muted/20 p-3'>
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
            <Badge className='shrink-0' variant='secondary'>
              {live.kills}/{live.deaths}/{live.assists}
            </Badge>
          </div>
        )}

        <Tabs
          className='flex min-h-0 flex-1 flex-col'
          onValueChange={(value) =>
            setView({
              ...activeView,
              tab: value === "matches" ? "matches" : "overview",
            })
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
              onSelectMatch={selectMatch}
            />
          </TabsContent>
          <TabsContent
            className='m-0 min-h-0 flex-1 overflow-hidden'
            value='matches'>
            <PlayerMatchExplorer
              accountId={accountId}
              heroesById={heroesById}
              matches={card.matches}
              onSelectMatch={selectMatch}
              selectedMatchId={selectedMatchId}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
