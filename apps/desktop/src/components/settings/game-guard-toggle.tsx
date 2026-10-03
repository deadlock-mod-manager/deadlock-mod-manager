import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { applyGameGuardSetting } from "@/lib/game-guard";
import { usePersistedStore } from "@/lib/store";

export const GameGuardToggle = () => {
  const { t } = useTranslation();
  const blockActionsWhileGameRunning = usePersistedStore(
    (state) => state.blockActionsWhileGameRunning,
  );
  const setBlockActionsWhileGameRunning = usePersistedStore(
    (state) => state.setBlockActionsWhileGameRunning,
  );

  const handleChange = (enabled: boolean) => {
    setBlockActionsWhileGameRunning(enabled);
    void applyGameGuardSetting(enabled);
  };

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>{t("settings.gameGuard")}</Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.gameGuardDescription")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={blockActionsWhileGameRunning}
          id='toggle-setting-game-guard'
          onCheckedChange={handleChange}
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
