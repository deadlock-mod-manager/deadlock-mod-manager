import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";

export const usePackGameCloseConfirmation = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  return async (): Promise<boolean> =>
    Boolean(
      await confirm({
        title: t("workbenchExplorer.closeGameTitle"),
        body: t("workbenchExplorer.closeGameBody"),
        actionButton: t("workbenchExplorer.closeGameAction"),
        cancelButton: t("common.cancel"),
        actionButtonVariant: "default",
      }),
    );
};
