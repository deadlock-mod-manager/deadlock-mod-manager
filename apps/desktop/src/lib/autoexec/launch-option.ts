import { CustomSettingType } from "@deadlock-mods/shared";
import { usePersistedStore } from "@/lib/store";

export const AUTOEXEC_LAUNCH_OPTION_ID = "autoexec-launch-option";

export const enableAutoexecLaunchOptionIfDisabled = (): void => {
  const { settings, toggleSetting } = usePersistedStore.getState();
  const autoexecSetting = settings[AUTOEXEC_LAUNCH_OPTION_ID];

  if (autoexecSetting?.enabled) {
    return;
  }

  toggleSetting(
    AUTOEXEC_LAUNCH_OPTION_ID,
    {
      id: AUTOEXEC_LAUNCH_OPTION_ID,
      key: "-exec",
      value: "autoexec",
      type: CustomSettingType.LAUNCH_OPTION,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    true,
  );
};

export const disableAutoexecLaunchOptionIfEnabled = (): void => {
  const { settings, toggleSetting } = usePersistedStore.getState();
  const autoexecSetting = settings[AUTOEXEC_LAUNCH_OPTION_ID];

  if (!autoexecSetting?.enabled) {
    return;
  }

  toggleSetting(AUTOEXEC_LAUNCH_OPTION_ID, autoexecSetting, false);
};
