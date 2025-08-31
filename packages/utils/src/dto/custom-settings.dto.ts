import type { CustomSetting } from '@deadlock-mods/database';

export const toCustomSettingDto = (customSetting: CustomSetting) => {
  return customSetting;
};

export type CustomSettingDto = ReturnType<typeof toCustomSettingDto>;
