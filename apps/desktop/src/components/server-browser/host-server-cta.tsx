import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ArrowSquareOutIcon, BroadcastIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { cn } from "@/lib/utils";

const DEADWORKS_RELAY_URL = "https://deadworks-relay.deadlockmods.app/";

interface HostServerCtaProps {
  className?: string;
}

const HostServerCta = ({ className }: HostServerCtaProps) => {
  const { t } = useTranslation();

  const handleOpen = async () => {
    try {
      await openUrl(DEADWORKS_RELAY_URL);
    } catch (err) {
      logger.withError(err).error("Failed to open Deadworks Relay URL");
      toast.error(t("servers.hostCta.openError"));
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-card bg-linear-to-r from-primary/10 via-card to-card px-4 py-2.5 ring-1 ring-primary/10",
        className,
      )}
      data-testid='host-server-cta'>
      <div className='flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary'>
        <BroadcastIcon className='size-4' weight='duotone' />
      </div>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-semibold'>
          {t("servers.hostCta.title")}
        </p>
        <p className='truncate text-xs text-muted-foreground'>
          {t("servers.hostCta.description")}
        </p>
      </div>
      <Button
        className='gap-2'
        onClick={handleOpen}
        size='sm'
        variant='outline'>
        {t("servers.hostCta.action")}
        <ArrowSquareOutIcon className='size-3.5' weight='bold' />
      </Button>
    </div>
  );
};

export default HostServerCta;
