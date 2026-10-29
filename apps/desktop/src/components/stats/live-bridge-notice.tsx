import { Button } from "@deadlock-mods/ui/components/button";
import { Loader2, RefreshCw, TriangleAlert } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { tint } from "@/components/stats/chart-fx";
import { useLiveBridge } from "@/hooks/use-live-bridge";
import { useGameRunning } from "@/hooks/use-mod-health";

const WARN = "#fbbf24";
const DANGER = "#f2766b";

/**
 * Says so when the live bridge was built for an older game or bridge. It is
 * rebuilt in the background as soon as the game is closed, so this mostly
 * explains the wait; the button covers an update that failed.
 */
export const LiveBridgeNotice = () => {
  const { t } = useTranslation();
  const { status, isUpdating, update } = useLiveBridge();
  const gameRunning = useGameRunning();

  if (status !== "outdated" && status !== "incompatible") return null;
  const isIncompatible = status === "incompatible";

  const color = isIncompatible ? DANGER : WARN;
  const Icon = isIncompatible ? TriangleAlert : RefreshCw;

  return (
    <div
      className='flex gap-2.5 rounded-lg border p-4'
      role='alert'
      style={{ backgroundColor: tint(color, 6), borderColor: tint(color, 25) }}>
      <Icon className='mt-0.5 h-4 w-4 shrink-0' style={{ color }} />
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <span className='font-semibold text-[13px]'>
          {isIncompatible
            ? t("stats.live.bridge.incompatibleTitle")
            : t("stats.live.bridge.outdatedTitle")}
        </span>
        <span className='text-muted-foreground text-xs leading-relaxed'>
          {isIncompatible
            ? t("stats.live.bridge.incompatible")
            : gameRunning
              ? t("stats.live.bridge.outdatedWhileRunning")
              : t("stats.live.bridge.outdated")}
        </span>
      </div>
      {!isIncompatible && !gameRunning && (
        <Button
          className='shrink-0 self-center'
          disabled={isUpdating}
          onClick={() => update.mutate()}
          size='sm'
          variant='outline'>
          {isUpdating && <Loader2 className='h-4 w-4 animate-spin' />}
          {isUpdating
            ? t("stats.live.bridge.updating")
            : t("stats.live.bridge.update")}
        </Button>
      )}
    </div>
  );
};
