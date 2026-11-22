import { useRemovePerfConfig } from "@/hooks/performance/use-perf-mutations";
import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import { Notice } from "./notice";

/** Our lines are in gameinfo.gi but no config is chosen, e.g. after restoring a backup. */
export const OrphanedOverlayNotice = ({ name }: { name: string }) => {
  const { t } = useTranslation();
  const removeMutation = useRemovePerfConfig();
  return (
    <Notice
      action={
        <Button
          isLoading={removeMutation.isPending}
          onClick={() => removeMutation.mutate({ entryPoint: "page" })}
          size='sm'
          variant='outline'>
          {t("performance.activeStatus.removeOrphaned")}
        </Button>
      }>
      {t("performance.activeStatus.orphaned", { name })}
    </Notice>
  );
};
