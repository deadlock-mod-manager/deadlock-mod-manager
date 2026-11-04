import { Card } from "@deadlock-mods/ui/components/card";
import { Crown } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { HERO_TILE_CLASS, tint } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import {
  ItemTile,
  TeamLabel,
  teamColor,
} from "@/components/stats/match/item-tile";
import type { DeadlockHero, DeadlockItem } from "@/lib/deadlock-api";
import type { MatchMetadata, SteamProfile } from "@/lib/stats/api";
import { formatClock, formatCompact } from "@/lib/stats/format";
import { lastStat, purchases } from "@/lib/stats/match-analysis";
import { cn } from "@/lib/utils";
import { TEAMS } from "./match-team-key";
import { BarCell } from "./scoreboard-bar-cell";

const BUILD_SHOWN = 9;

const GRID =
  "grid grid-cols-[minmax(180px,1.6fr)_88px_minmax(110px,1fr)_minmax(110px,1fr)_72px_76px_minmax(230px,2fr)] items-center gap-4";

interface ScoreboardProps {
  match: MatchMetadata["match_info"];
  meId: number;
  heroesById: Map<number, DeadlockHero>;
  itemsById: Map<number, DeadlockItem>;
  profiles: Map<number, SteamProfile>;
  onSelectPlayer: (accountId: number) => void;
}

/** Both teams, the player's row tinted, the lobby's best in each stat crowned. */
export const Scoreboard = ({
  match,
  meId,
  heroesById,
  itemsById,
  profiles,
  onSelectPlayer,
}: ScoreboardProps) => {
  const { t } = useTranslation();
  const { players } = match;
  const max = {
    souls: Math.max(...players.map((player) => player.net_worth)),
    damage: Math.max(
      ...players.map((player) => lastStat(player)?.player_damage ?? 0),
    ),
    healing: Math.max(
      ...players.map((player) => lastStat(player)?.player_healing ?? 0),
    ),
  };

  return (
    <div className='flex flex-col gap-4'>
      {TEAMS.map((team) => {
        const members = players.filter((player) => player.team === team);
        const won = match.winning_team === team;
        const souls = members.reduce(
          (sum, player) => sum + player.net_worth,
          0,
        );
        const kills = members.reduce((sum, player) => sum + player.kills, 0);
        return (
          <Card
            className='stats-surface overflow-hidden shadow-none'
            key={team}>
            <div
              className='flex flex-wrap items-center justify-between gap-3 border-border/60 border-b px-5 py-3.5'
              style={{ backgroundColor: tint(teamColor(team), 6) }}>
              <TeamLabel team={team} won={won} />
              <div className='flex items-center gap-5 text-[11.5px] text-muted-foreground'>
                <span>
                  {t("stats.match.kills")}{" "}
                  <span className='font-mono font-semibold text-foreground'>
                    {kills}
                  </span>
                </span>
                <span>
                  {t("stats.match.souls")}{" "}
                  <span className='font-mono font-semibold text-foreground'>
                    {formatCompact(souls)}
                  </span>
                </span>
              </div>
            </div>
            <div className='overflow-x-auto'>
              <div className='min-w-[1000px]'>
                <div
                  className={cn(
                    GRID,
                    "px-5 py-2 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-[0.1em]",
                  )}>
                  <span>{t("stats.match.columns.player")}</span>
                  <span>{t("stats.match.columns.kda")}</span>
                  <span>{t("stats.match.columns.souls")}</span>
                  <span>{t("stats.match.columns.damage")}</span>
                  <span>{t("stats.match.columns.healing")}</span>
                  <span>{t("stats.match.columns.lastHits")}</span>
                  <span>{t("stats.match.columns.build")}</span>
                </div>
                {members.map((player) => {
                  const isMe = player.account_id === meId;
                  const hero = heroesById.get(player.hero_id);
                  const name =
                    profiles.get(player.account_id)?.personaname ??
                    t("stats.unknownPlayer");
                  const build = purchases(player.items, itemsById).filter(
                    (purchase) => purchase.soldAt === null,
                  );
                  const healing = lastStat(player)?.player_healing ?? 0;
                  return (
                    <div
                      className={cn(
                        GRID,
                        "border-border/50 border-t px-5 py-2.5",
                        isMe && "bg-primary/[0.05]",
                      )}
                      key={player.account_id}>
                      <button
                        className='flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        onClick={() => onSelectPlayer(player.account_id)}
                        type='button'>
                        <span className='relative shrink-0'>
                          <HeroAvatar
                            className={cn(
                              "h-9 w-9",
                              HERO_TILE_CLASS,
                              isMe && "ring-[1.5px] ring-primary/60",
                            )}
                            hero={hero}
                            heroId={player.hero_id}
                          />
                          <span className='absolute -right-1 -bottom-1 flex h-3.5 min-w-[18px] items-center justify-center rounded border border-border bg-background px-0.5 font-bold font-mono text-[8.5px]'>
                            {player.level}
                          </span>
                        </span>
                        <span className='flex min-w-0 flex-col'>
                          <span className='flex items-center gap-1.5'>
                            <span className='truncate font-medium text-[13px] hover:underline'>
                              {name}
                            </span>
                            {isMe && (
                              <span className='rounded-full bg-primary px-1.5 font-bold text-[10px] text-primary-foreground'>
                                {t("stats.match.you")}
                              </span>
                            )}
                          </span>
                          <span className='truncate text-[11.5px] text-muted-foreground'>
                            {hero?.name ?? `#${player.hero_id}`}
                          </span>
                        </span>
                      </button>
                      <span className='font-mono font-semibold text-[13px]'>
                        {player.kills}/{player.deaths}/{player.assists}
                      </span>
                      <BarCell
                        color={teamColor(team)}
                        max={max.souls}
                        value={player.net_worth}
                      />
                      <BarCell
                        color='hsl(var(--primary))'
                        max={max.damage}
                        value={lastStat(player)?.player_damage ?? 0}
                      />
                      <span className='flex items-center gap-1.5 font-mono font-semibold text-[12.5px]'>
                        {formatCompact(healing)}
                        {healing === max.healing && healing > 0 && (
                          <Crown aria-hidden className='h-3 w-3 text-primary' />
                        )}
                      </span>
                      <span className='font-mono text-[12.5px] text-foreground/80'>
                        {player.last_hits} / {player.denies}
                      </span>
                      <div className='flex items-center gap-[3px]'>
                        {build.slice(-BUILD_SHOWN).map((purchase) => (
                          <ItemTile
                            className='h-6 w-6'
                            hint={formatClock(purchase.time)}
                            item={purchase.item}
                            key={`${purchase.item.id}-${purchase.time}`}
                          />
                        ))}
                        {build.length > BUILD_SHOWN && (
                          <span className='pl-0.5 font-mono text-[10.5px] text-muted-foreground'>
                            +{build.length - BUILD_SHOWN}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
