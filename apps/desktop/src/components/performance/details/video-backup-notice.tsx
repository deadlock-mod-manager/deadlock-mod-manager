import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useRestoreVideoBackup } from "@/hooks/performance/use-perf-mutations";
import { usePerfStatus } from "@/hooks/performance/use-perf-queries";

/** Offers the player's own video.txt back once the mod manager has written it. */
export const VideoBackupNotice = () => {
  const { t, i18n } = useTranslation();
  const { data: status } = usePerfStatus();
  const restore = useRestoreVideoBackup();
  const backup = status?.videoBackup;
  if (!backup) return null;

  return (
    <div className='flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/40 px-3 py-2'>
      <p className='text-muted-foreground text-xs'>
        {t("performance.details.video.backup", {
          date: new Date(backup.takenAt).toLocaleDateString(i18n.language, {
            month: "short",
            day: "numeric",
          }),
        })}
      </p>
      <Button
        icon={<ArrowCounterClockwiseIcon aria-hidden weight='bold' />}
        isLoading={restore.isPending}
        onClick={() => restore.mutate()}
        size='sm'
        variant='outline'>
        {t("performance.details.video.restore")}
      </Button>
    </div>
  );
};
