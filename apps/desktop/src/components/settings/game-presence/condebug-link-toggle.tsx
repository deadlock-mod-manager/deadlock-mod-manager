import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const CondebugLinkToggle = () => {
  const { t } = useTranslation();
  const condebugLinkedToPresence = usePersistedStore(
    (state) => state.condebugLinkedToPresence,
  );
  const setCondebugLinkedToPresence = usePersistedStore(
    (state) => state.setCondebugLinkedToPresence,
  );

  return (
    <SettingToggleRow
      checked={condebugLinkedToPresence}
      description={t("gamePresence.condebugLinkedDescription")}
      id='toggle-game-presence-condebug-linked'
      onCheckedChange={setCondebugLinkedToPresence}
      title={t("gamePresence.condebugLinked")}
    />
  );
};
