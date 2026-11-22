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
import { ChevronsUpDown, User } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { SteamAccount } from "@/hooks/use-steam-accounts";
import type { SteamProfile } from "@/lib/stats/api";
import { cn } from "@/lib/utils";

export const accountDisplayName = (
  profile: SteamProfile | null,
  account: SteamAccount | null,
) => profile?.personaname ?? account?.personaName ?? account?.accountName ?? "";

export const PlayerAvatar = ({
  profile,
  name,
  className,
}: {
  profile: SteamProfile | null | undefined;
  name: string;
  className?: string;
}) => (
  <Avatar className={cn("h-11 w-11", className)}>
    {profile?.avatarfull && <AvatarImage alt={name} src={profile.avatarfull} />}
    {/* deadlock-api has no Steam profile for some accounts, so this is what
        most new players see; the ring keeps it reading as an avatar. */}
    <AvatarFallback className='border border-border/60 bg-secondary text-muted-foreground'>
      <User className='h-1/2 w-1/2' />
    </AvatarFallback>
  </Avatar>
);

interface AccountSwitcherProps {
  accounts: SteamAccount[];
  onSelectAccount: (accountId: number) => void;
}

/** The chevron that switches between the Steam accounts on this machine. */
export const AccountSwitcher = ({
  accounts,
  onSelectAccount,
}: AccountSwitcherProps) => {
  const { t } = useTranslation();
  if (accounts.length < 2) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("stats.switchAccount")}
          className='h-6 w-6 text-muted-foreground'
          size='icon'
          variant='ghost'>
          <ChevronsUpDown className='h-3.5 w-3.5' />
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
  );
};
