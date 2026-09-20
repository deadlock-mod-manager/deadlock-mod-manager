import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { setGameGuardPrompt } from "@/lib/game-guard";

/**
 * Owns the dialog the guard shows when an operation is blocked. It lives here,
 * mounted once, because the block can come from anywhere in the app - a hook, a
 * store action or a settings page - and none of those can open a dialog.
 */
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
