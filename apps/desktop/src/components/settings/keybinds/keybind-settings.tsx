import { Button } from "@deadlock-mods/ui/components/button";
import { Keyboard } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeybindsDialog } from "@/components/settings/keybinds/keybinds-dialog";
import { SettingRow } from "@/components/settings/setting-row";

export const KeybindSettings = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <SettingRow
      description={t("keybinds.rowDescription")}
      title={t("keybinds.title")}>
      <Button
        id='settings-keybinds'
        onClick={() => setOpen(true)}
        variant='outline'>
        <Keyboard className='size-4' />
        {t("keybinds.customize")}
      </Button>
      <KeybindsDialog onOpenChange={setOpen} open={open} />
    </SettingRow>
  );
};
