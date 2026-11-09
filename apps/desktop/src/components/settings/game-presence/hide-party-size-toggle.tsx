import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const HidePartySizeToggle = () => {
  const { t } = useTranslation();
  const gamePresenceEnabled = usePersistedStore(
    (state) => state.gamePresenceEnabled,
  );
  const hidePartySize = usePersistedStore(
    (state) => state.gamePresenceHidePartySize,
  );
  const setHidePartySize = usePersistedStore(
    (state) => state.setGamePresenceHidePartySize,
  );

  return (
    <SettingToggleRow
      checked={hidePartySize}
      description={t("gamePresence.hidePartySizeDescription")}
      disabled={!gamePresenceEnabled}
      id='toggle-game-presence-hide-party-size'
      onCheckedChange={setHidePartySize}
      title={t("gamePresence.hidePartySize")}
    />
  );
};
