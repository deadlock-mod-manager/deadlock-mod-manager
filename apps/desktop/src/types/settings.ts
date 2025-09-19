import type { CustomSettingDto } from "@deadlock-mods/shared";

export interface LocalSetting extends CustomSettingDto {
  enabled: boolean;
}

export interface SystemSetting extends LocalSetting {
  onChange: (newValue: boolean) => void;
}
