import { Button } from "@deadlock-mods/ui/components/button";
import { Keyboard } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/components/settings/setting-row";
import { useKeybindsDialog } from "@/lib/keybinds-dialog";

export const KeybindSettings = () => {
  const { t } = useTranslation();
  const showKeybinds = useKeybindsDialog((s) => s.show);

  return (
    <SettingRow
      description={t("keybinds.rowDescription")}
      title={t("keybinds.title")}>
      <Button
        id='settings-keybinds'
        onClick={(event) => showKeybinds(event.currentTarget)}
        variant='outline'>
        <Keyboard className='size-4' />
        {t("keybinds.customize")}
      </Button>
    </SettingRow>
  );
};
