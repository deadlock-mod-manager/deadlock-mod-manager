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
    <div className='flex flex-row items-center justify-between gap-4 rounded-md border border-border/30 bg-background/40 px-4 py-3'>
      <div className='flex min-w-0 flex-col gap-1'>
        <h3 className='font-bold text-sm'>{t("gamePresence.title")}</h3>
        <p className='text-muted-foreground text-sm'>
          {t("gamePresence.description")}
        </p>
      </div>
      <div className='flex shrink-0 items-center'>
        <Switch
          checked={gamePresenceEnabled}
          id='toggle-game-presence'
          onCheckedChange={setGamePresenceEnabled}
        />
      </div>
    </div>
  );
};
