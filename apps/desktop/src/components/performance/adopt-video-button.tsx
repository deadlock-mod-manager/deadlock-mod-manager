import { Button } from "@deadlock-mods/ui/components/button";
import { PushPinIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useAdoptVideo } from "@/hooks/performance/use-perf-mutations";
import { usePerfStatus } from "@/hooks/performance/use-perf-queries";

/**
 * Keeps the video.txt a config wrote as the player's own, so another config
 * can be applied without writing over it.
 */
export const AdoptVideoButton = ({ name }: { name: string }) => {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const { data: status } = usePerfStatus();
  const adopt = useAdoptVideo();
  const backup = status?.videoBackup;
  if (!backup) return null;

  const onClick = async () => {
    const confirmed = await confirm({
      title: t("performance.details.video.adoptConfirm.title"),
      body: t("performance.details.video.adoptConfirm.body", {
        name,
        date: new Date(backup.takenAt).toLocaleDateString(i18n.language, {
          month: "short",
          day: "numeric",
        }),
      }),
      actionButton: t("performance.details.video.adopt"),
      icon: PushPinIcon,
    });
    if (confirmed) adopt.mutate();
  };

  return (
    <Button
      icon={<PushPinIcon aria-hidden />}
      isLoading={adopt.isPending}
      onClick={onClick}
      size='sm'
      variant='ghost'>
      {t("performance.details.video.adopt")}
    </Button>
  );
};
