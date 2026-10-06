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
import { ChevronDown, User } from "@deadlock-mods/ui/icons";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  onSelectAccount: (accountId: number) => void;
  /** The page tabs, opposite the account. */
  tabs?: ReactNode;
}

export const StatsHeader = ({
  accounts,
  account,
  accountId,
  profile,
  rank,
  rankAssets,
  onSelectAccount,
  tabs,
}: StatsHeaderProps) => {
  const { t } = useTranslation();

  const badge = resolveRank(rank?.badge, rankAssets);
  const displayName =
    profile?.personaname ?? account?.personaName ?? account?.accountName ?? "";

  return (
    // Who and which view, nothing else: freshness and match sharing sit up in
    // the title row. Tabs go right, under that status group, so both rows share
    // a right edge. Too narrow for both, they stack.
    <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
      <div className='flex min-w-0 items-center gap-3'>
        <Avatar className='h-11 w-11'>
          {profile?.avatarfull && (
            <AvatarImage alt={displayName} src={profile.avatarfull} />
          )}
          {/* deadlock-api has no Steam profile for some accounts, so this is
              what most new players see. A plain bg-muted circle disappears into
              the page; the ring and icon keep it reading as an avatar. */}
          <AvatarFallback className='border border-border/60 bg-secondary text-muted-foreground'>
            <User className='h-5 w-5' />
          </AvatarFallback>
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

      <div className='flex min-w-0 justify-center lg:justify-end'>{tabs}</div>
    </div>
  );
};
