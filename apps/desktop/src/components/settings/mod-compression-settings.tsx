import { Progress } from "@deadlock-mods/ui/components/progress";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { WarningIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useModCompression } from "@/hooks/use-mod-compression";
import { isGameRunning } from "@/lib/api";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";

export const ModCompressionSettings = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const gamePath = usePersistedStore((state) => state.gamePath);
  const compressionEnabled = usePersistedStore(
    (state) => state.compressionEnabled,
  );
  const compressionProgress = usePersistedStore(
    (state) => state.compressionProgress,
  );
  const { enableCompression, disableCompression } = useModCompression();

  const { data: gameRunning } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: () => isGameRunning(),
    staleTime: STALE_TIME_POLL,
    refetchInterval: 5000,
    enabled: !!gamePath,
  });

  const isBusy =
    compressionProgress.status === "merging" ||
    compressionProgress.status === "extracting";
  const pct =
    compressionProgress.total > 0
      ? Math.round(
          (compressionProgress.current / compressionProgress.total) * 100,
        )
      : 0;

  const handleToggle = async (next: boolean) => {
    if (gameRunning === true) {
      toast.error(t("settings.modCompression.gameRunning"));
      return;
    }
    if (next) {
      const ok = await confirm({
        title: t("settings.modCompression.enableConfirmTitle"),
        body: t("settings.modCompression.enableConfirmBody"),
        actionButton: t("settings.modCompression.enableConfirmAction"),
        cancelButton: t("common.cancel"),
        tone: "destructive",
      });
      if (!ok) return;
      try {
        await enableCompression();
      } catch (e) {
        toast.error(String(e));
      }
    } else {
      const ok = await confirm({
        title: t("settings.modCompression.disableConfirmTitle"),
        body: t("settings.modCompression.disableConfirmBody"),
        actionButton: t("settings.modCompression.disableConfirmAction"),
        cancelButton: t("common.cancel"),
        tone: "destructive",
      });
      if (!ok) return;
      try {
        await disableCompression();
      } catch (e) {
        toast.error(String(e));
      }
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-4'>
        <div className='space-y-0.5'>
          <p className='text-sm font-medium'>
            {t("settings.modCompression.enableLabel")}
          </p>
        </div>
        <Switch
          checked={compressionEnabled}
          disabled={isBusy || gameRunning === true}
          onCheckedChange={(v) => void handleToggle(v)}
        />
      </div>

      <div className='rounded-md border-yellow-500 border-l-4 bg-yellow-50 p-3 dark:bg-yellow-950/20'>
        <div className='flex items-center gap-2'>
          <WarningIcon className='h-4 w-4 text-yellow-600' />
          <span className='font-medium text-sm text-yellow-800 dark:text-yellow-200'>
            {t("settings.modCompression.warningTitle")}
          </span>
        </div>
        <p className='mt-1 text-xs text-yellow-700 dark:text-yellow-300'>
          {t("settings.modCompression.warningBody")}
        </p>
      </div>

      {isBusy && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>
            {t("modCompression.progress", {
              current: compressionProgress.current,
              total: compressionProgress.total,
            })}
          </p>
          <Progress className='h-2' value={pct} />
        </div>
      )}
    </div>
  );
};
