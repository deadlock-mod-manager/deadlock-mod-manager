import { toast } from "@deadlock-mods/ui/components/sonner";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

const FORGE_LAUNCH_EVENT = "forge-launch-requested";

/**
 * Raised when deadlockforge.net cannot find the bridge and fires the app's
 * protocol URL to bring it up. Without this the app would surface with no
 * explanation of why, and the user would have to find the Settings toggle on
 * their own before the site's button could work.
 */
export const useForgeLaunchPrompt = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const forgeInstallEnabled = usePersistedStore(
    (state) => state.forgeInstallEnabled,
  );
  const setForgeInstallEnabled = usePersistedStore(
    (state) => state.setForgeInstallEnabled,
  );

  const enabledRef = useRef(forgeInstallEnabled);
  enabledRef.current = forgeInstallEnabled;

  useEffect(() => {
    const unlisten = listen(FORGE_LAUNCH_EVENT, async () => {
      if (enabledRef.current) {
        toast.info(t("forge.alreadyEnabled"));
        return;
      }

      const accepted = !!(await confirm({
        title: t("forge.enableTitle"),
        body: t("forge.enableBody"),
        actionButton: t("forge.enableAction"),
        cancelButton: t("forge.enableCancel"),
      }));

      if (!accepted) {
        logger.info("Forge 1-click installs declined at the prompt");
        return;
      }

      setForgeInstallEnabled(true);
      toast.success(t("forge.enabled"));
    });

    return () => {
      unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, [confirm, t, setForgeInstallEnabled]);
};
