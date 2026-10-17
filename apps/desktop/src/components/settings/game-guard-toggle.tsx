import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { applyGameGuardSetting } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export const GameGuardToggle = () => {
  const { t } = useTranslation();
  const blockActionsWhileGameRunning = usePersistedStore(
    (state) => state.blockActionsWhileGameRunning,
  );
  const setBlockActionsWhileGameRunning = usePersistedStore(
    (state) => state.setBlockActionsWhileGameRunning,
  );

  // Saved only once the backend has it, so the switch never shows protection
  // the guard is not actually applying.
  const toggleMutation = useMutation({
    mutationFn: applyGameGuardSetting,
    onSuccess: (_, enabled) => {
      setBlockActionsWhileGameRunning(enabled);
    },
    onError: (error) => {
      logger.withError(error).error("Failed to sync the game guard setting");
      toast.error(t("settings.gameGuardSyncFailed"));
    },
  });

  return (
    <SettingToggleRow
      checked={blockActionsWhileGameRunning}
      description={t("settings.gameGuardDescription")}
      disabled={toggleMutation.isPending}
      id='toggle-setting-game-guard'
      onCheckedChange={(enabled) => toggleMutation.mutate(enabled)}
      title={t("settings.gameGuard")}
    />
  );
};
