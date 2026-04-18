import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  LockKeyIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import CapacityBar from "../capacity-bar";

interface ServerDetailHeaderProps {
  server: ServerBrowserEntry;
  isLive: boolean;
  onClose: () => void;
}

const ServerDetailHeader = ({
  server,
  isLive,
  onClose,
}: ServerDetailHeaderProps) => {
  const { t } = useTranslation();
  return (
    <header className='relative border-b border-border/60 bg-linear-to-br from-primary/5 via-card/40 to-transparent p-4'>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0 space-y-1.5'>
          <div className='flex items-center gap-2'>
            <span className='relative inline-flex size-2.5 shrink-0'>
              {isLive && (
                <span className='absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75' />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2.5 rounded-full",
                  isLive ? "bg-emerald-500" : "bg-amber-400",
                )}
              />
            </span>
            <h2 className='truncate text-lg font-semibold leading-tight'>
              {server.name}
            </h2>
          </div>
          <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
            <Badge className='gap-1 py-0 pr-1.5 pl-1' variant='secondary'>
              <UsersThreeIcon className='size-3' weight='fill' />
              <span className='tabular-nums'>
                {server.player_count}/{server.max_players}
              </span>
            </Badge>
            {server.password_protected && (
              <Badge className='gap-1 py-0 pr-1.5 pl-1' variant='outline'>
                <LockKeyIcon className='size-3 text-amber-400' weight='fill' />
                {t("servers.badges.password")}
              </Badge>
            )}
            {server.auth_required && (
              <Badge className='gap-1 py-0 pr-1.5 pl-1' variant='outline'>
                <ShieldCheckIcon
                  className='size-3 text-sky-400'
                  weight='fill'
                />
                {t("servers.badges.auth")}
              </Badge>
            )}
          </div>
        </div>
        <Button
          aria-label='Close'
          className='size-8 shrink-0'
          onClick={onClose}
          size='icon'
          variant='ghost'>
          <XIcon className='size-4' />
        </Button>
      </div>
      <CapacityBar
        className='mt-3'
        current={server.player_count}
        max={server.max_players}
      />
    </header>
  );
};

export default ServerDetailHeader;
