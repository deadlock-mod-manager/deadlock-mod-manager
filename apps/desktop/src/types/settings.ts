import { CustomSettingDto } from '@deadlock-mods/utils';

export interface LocalSetting extends CustomSettingDto {
  enabled: boolean;
}

export interface SystemSetting extends LocalSetting {
  onChange: (newValue: boolean) => void;
}
