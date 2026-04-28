import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

export const GamePresenceSettings = () => {
  const { t } = useTranslation();
  const gamePresenceEnabled = usePersistedStore(
    (state) => state.gamePresenceEnabled,
  );
  const setGamePresenceEnabled = usePersistedStore(
    (state) => state.setGamePresenceEnabled,
  );

  return (
    <div className='flex items-center justify-between rounded-md border border-border/30 bg-background/40 px-4 py-3'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>{t("gamePresence.title")}</Label>
        <p className='text-sm text-muted-foreground'>
          {t("gamePresence.description")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={gamePresenceEnabled}
          id='toggle-game-presence'
          onCheckedChange={setGamePresenceEnabled}
        />
        <Label htmlFor='toggle-game-presence'>
          {gamePresenceEnabled ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
