import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { openGameInfoEditor } from "@/lib/tauri-commands";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { FileTextIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

export const OpenInEditorButton = () => {
  const { t } = useTranslation();
  const openMutation = useMutation({
    mutationFn: openGameInfoEditor,
    meta: { skipGlobalErrorHandler: true },
    onError: (error) => {
      logger.withError(error).error("Opening gameinfo.gi failed");
      toast.error(t("performance.activeStatus.openInEditorFailed"), {
        description: getErrorMessage(error),
      });
    },
  });

  return (
    <Button
      icon={<FileTextIcon aria-hidden />}
      isLoading={openMutation.isPending}
      onClick={() => openMutation.mutate()}
      size='sm'
      variant='ghost'>
      {t("performance.activeStatus.openInEditor")}
    </Button>
  );
};
