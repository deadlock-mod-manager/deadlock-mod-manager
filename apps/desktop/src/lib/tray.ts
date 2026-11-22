import { invoke } from "@tauri-apps/api/core";

export type TrayBehavior = {
  minimizeToTray: boolean;
  closeToTray: boolean;
};

export const applyTrayBehavior = async (
  behavior: TrayBehavior,
): Promise<void> => {
  await invoke("set_tray_behavior", behavior);
};

export const hideToTrayOnClose = (): Promise<boolean> =>
  invoke<boolean>("hide_to_tray_on_close");
