import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ChevronDown, Loader2, RefreshCw } from "@deadlock-mods/ui/icons";
import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SteamAccount } from "@/hooks/use-steam-accounts";
import type { PlayerRank, RankAsset, SteamProfile } from "@/lib/stats/api";

interface StatsHeaderProps {
  accounts: SteamAccount[];
  account: SteamAccount | null;
  accountId: number | null;
  profile: SteamProfile | null;
  rank: PlayerRank | null;
  rankAssets: RankAsset[];
  fetchedAt: number | null;
  isStale: boolean;
  isRefreshing: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  onSelectAccount: (accountId: number) => void;
  /** Sits centred between the account and the refresh controls - the page tabs. */
  center?: ReactNode;
}

/** Valve packs division and tier into one number: 26 reads as division 2, tier 6. */
const splitBadge = (badge: number) => ({
  tier: Math.floor(badge / 10),
  subrank: badge % 10,
});

export const StatsHeader = ({
  accounts,
  account,
  accountId,
  profile,
  rank,
  rankAssets,
  fetchedAt,
  isStale,
  isRefreshing,
  canRefresh,
  onRefresh,
  onSelectAccount,
  center,
}: StatsHeaderProps) => {
  const { t } = useTranslation();

  const { tier, subrank } = splitBadge(rank?.badge ?? 0);
  const rankAsset = rankAssets.find((asset) => asset.tier === tier);
  const rankImage =
    rankAsset?.images[`large_subrank${subrank}`] ?? rankAsset?.images.large;
  const displayName =
    profile?.personaname ?? account?.personaName ?? account?.accountName ?? "";

  return (
    // Three tracks so the centre slot is centred on the page, not on whatever is
    // left over between the two side groups.
    <div className='grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3'>
      <div className='flex min-w-0 items-center gap-3'>
        <Avatar className='h-11 w-11'>
          {profile?.avatarfull && (
            <AvatarImage alt={displayName} src={profile.avatarfull} />
          )}
          <AvatarFallback>{displayName.charAt(0) || "?"}</AvatarFallback>
        </Avatar>
        <div className='min-w-0'>
          <div className='flex items-center gap-1'>
            <span className='truncate font-semibold'>
              {displayName || t("stats.unknownPlayer")}
            </span>
            {accounts.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className='h-6 w-6' size='icon' variant='ghost'>
                    <ChevronDown className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start'>
                  {accounts.map((candidate) => (
                    <DropdownMenuItem
                      key={candidate.accountId}
                      onClick={() => onSelectAccount(candidate.accountId)}>
                      <span className='truncate'>
                        {candidate.personaName ?? candidate.accountName}
                      </span>
                      {candidate.isActive && (
                        <span className='ml-2 text-muted-foreground text-xs'>
                          {t("stats.signedIn")}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className='flex items-center gap-2 text-muted-foreground text-xs'>
            {rankImage ? (
              <>
                <img
                  alt=''
                  className='h-5 w-5 object-contain'
                  src={rankImage}
                />
                <span>
                  {rankAsset?.name}
                  {subrank > 0 ? ` ${subrank}` : ""}
                </span>
              </>
            ) : (
              <span>{t("stats.unranked")}</span>
            )}
            <span aria-hidden>·</span>
            <span className='tabular-nums'>{accountId}</span>
          </div>
        </div>
      </div>

      <div className='flex justify-center'>{center}</div>

      <div className='flex items-center justify-end gap-2'>
        {fetchedAt !== null && (
          <span className='text-muted-foreground text-xs'>
            {isStale
              ? t("stats.offlineData", {
                  ago: formatDistanceToNow(fetchedAt, { addSuffix: true }),
                })
              : t("stats.updated", {
                  ago: formatDistanceToNow(fetchedAt, { addSuffix: true }),
                })}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              disabled={!canRefresh || isRefreshing}
              onClick={onRefresh}
              size='sm'
              variant='outline'>
              {isRefreshing ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <RefreshCw className='h-4 w-4' />
              )}
              {t("stats.refresh")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {canRefresh ? t("stats.refreshHint") : t("stats.refreshCooldown")}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
