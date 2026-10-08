import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useIsMutating } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CATALOG_SYNC_KEY,
  useCatalogSyncMutation,
} from "@/hooks/use-gamebanana-catalog-sync";

export const CatalogRefreshButton = () => {
  const { t } = useTranslation();
  const refresh = useCatalogSyncMutation(true);
  const syncing = useIsMutating({ mutationKey: CATALOG_SYNC_KEY }) > 0;
  const label = t(syncing ? "mods.catalogRefreshing" : "mods.catalogRefresh");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-busy={syncing}
          className='shrink-0 text-muted-foreground hover:text-foreground'
          disabled={syncing}
          onClick={() => refresh.mutate(false)}
          size='icon'
          variant='outline'>
          <ArrowsClockwise
            aria-hidden
            className={syncing ? "size-4 motion-safe:animate-spin" : "size-4"}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};
