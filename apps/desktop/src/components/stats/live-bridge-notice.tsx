import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Loader2, RefreshCw } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useLiveBridge } from "@/hooks/use-live-bridge";
import { useGameRunning } from "@/hooks/use-mod-health";

/**
 * Says so when the live bridge was built for an older game or bridge. It is
 * rebuilt in the background as soon as the game is closed, so this mostly
 * explains the wait; the button covers an update that failed.
 */
export const LiveBridgeNotice = () => {
  const { t } = useTranslation();
  const { isOutdated, update } = useLiveBridge();
  const gameRunning = useGameRunning();

  if (!isOutdated) return null;

  return (
    <Alert variant='warning'>
      <RefreshCw className='h-4 w-4' />
      <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
        <span>
          {gameRunning
            ? t("stats.live.bridge.outdatedWhileRunning")
            : t("stats.live.bridge.outdated")}
        </span>
        {!gameRunning && (
          <Button
            disabled={update.isPending}
            onClick={() => update.mutate()}
            size='sm'
            variant='outline'>
            {update.isPending && <Loader2 className='h-4 w-4 animate-spin' />}
            {update.isPending
              ? t("stats.live.bridge.updating")
              : t("stats.live.bridge.update")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};
