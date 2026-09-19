import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label
          className='font-bold text-sm'
          htmlFor='toggle-setting-game-guard'>
          {t("settings.gameGuard")}
        </Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.gameGuardDescription")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={blockActionsWhileGameRunning}
          disabled={toggleMutation.isPending}
          id='toggle-setting-game-guard'
          onCheckedChange={(enabled) => toggleMutation.mutate(enabled)}
        />
        <Label htmlFor='toggle-setting-game-guard'>
          {blockActionsWhileGameRunning
            ? t("status.enabled")
            : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
