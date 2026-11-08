import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardHeader, CardTitle } from "@deadlock-mods/ui/components/card";
import { DownloadIcon, Loader2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import liveBridgeLogo from "@/assets/live-bridge.svg";
import {
  LIVE_BRIDGE_AUTHOR,
  LIVE_BRIDGE_NAME,
  useLiveBridge,
} from "@/hooks/use-live-bridge";

/**
 * The live bridge in the Deadlock Mod Manager source. It is built from the
 * installed game rather than downloaded, so the app lists it itself next to
 * the API's packs and installs it the way the Stats page does.
 */
export const LiveBridgeCard = () => {
  const { t } = useTranslation();
  const { inLibrary, status, install } = useLiveBridge();
  // `notInstalled` covers a copy in the library that the profile doesn't load.
  const enabled = status !== null && status !== "notInstalled";

  return (
    <Card className='h-full border shadow-none'>
      <div className='relative'>
        <img
          alt={LIVE_BRIDGE_NAME}
          className='h-48 w-full rounded-t-xl object-cover'
          height='192'
          src={liveBridgeLogo}
          width='320'
        />
        {enabled && (
          <div className='absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/60 to-transparent px-2 pt-6 pb-2'>
            <Badge>{t("modStatus.installed")}</Badge>
          </div>
        )}
      </div>
      <CardHeader className='gap-3 px-3 py-4'>
        <div className='space-y-1'>
          <CardTitle className='truncate leading-tight'>
            {LIVE_BRIDGE_NAME}
          </CardTitle>
          <span className='text-muted-foreground text-sm'>
            {t("mods.by")} {LIVE_BRIDGE_AUTHOR}
          </span>
        </div>
        <p className='line-clamp-3 text-muted-foreground text-xs leading-relaxed'>
          {t("stats.live.bridge.modDescription")}
        </p>
        {status !== null && !enabled && (
          <Button
            className='self-end'
            disabled={install.isPending}
            onClick={() => install.mutate()}
            size='sm'
            variant='outline'>
            {install.isPending ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <DownloadIcon className='h-4 w-4' />
            )}
            {install.isPending
              ? t("stats.live.bridge.installing")
              : inLibrary
                ? t("stats.live.bridge.enable")
                : t("modSources.installBuiltIn")}
          </Button>
        )}
      </CardHeader>
    </Card>
  );
};
