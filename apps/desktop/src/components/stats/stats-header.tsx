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
import { DeadlockApiCredit } from "@/components/stats/deadlock-api-credit";
import type { SteamAccount } from "@/hooks/use-steam-accounts";
import {
  type PlayerRank,
  type RankAsset,
  resolveRank,
  type SteamProfile,
} from "@/lib/stats/api";

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

  const badge = resolveRank(rank?.badge, rankAssets);
  const displayName =
    profile?.personaname ?? account?.personaName ?? account?.accountName ?? "";

  return (
    // From `lg` up, three tracks so the centre slot is centred on the page, not
    // on whatever is left over between the two side groups. Narrower than that
    // the three groups would fight over the same row, so they stack instead.
    <div className='flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center'>
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
            {badge.image ? (
              <>
                <img
                  alt=''
                  className='h-5 w-5 object-contain'
                  src={badge.image}
                />
                <span>
                  {badge.name}
                  {badge.subrank > 0 ? ` ${badge.subrank}` : ""}
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

      <div className='flex min-w-0 justify-center'>{center}</div>

      <div className='flex items-center justify-center gap-3 lg:justify-end'>
        {/* Two quiet lines rather than a row of chips: where the data came from
            and how fresh it is are context, not controls. */}
        <div className='flex flex-col items-end gap-0.5'>
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
          <DeadlockApiCredit />
        </div>

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
