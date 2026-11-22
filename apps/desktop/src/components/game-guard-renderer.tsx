import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { setGameGuardPrompt } from "@/lib/game-guard";

export const GameGuardRenderer = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();

  useEffect(() => {
    setGameGuardPrompt(async () => {
      const answer = await confirm({
        title: t("gameGuard.title"),
        body: t("gameGuard.body"),
        cancelButton: t("gameGuard.cancel"),
        cancelButtonVariant: "default",
        actionButton: t("gameGuard.continueAnyway"),
        actionButtonVariant: "destructive",
      });
      return Boolean(answer);
    });
    return () => setGameGuardPrompt(null);
  }, [confirm, t]);

  return null;
};
