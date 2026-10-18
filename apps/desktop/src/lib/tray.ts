import { invoke } from "@tauri-apps/api/core";

export type TrayBehavior = {
  minimizeToTray: boolean;
  closeToTray: boolean;
};

/** Mirrors the tray settings into the backend, which owns the tray icon. */
export const applyTrayBehavior = async (
  behavior: TrayBehavior,
): Promise<void> => {
  await invoke("set_tray_behavior", behavior);
};

/** Hides the window to the tray when close-to-tray is on. Returns whether it did. */
export const hideToTrayOnClose = (): Promise<boolean> =>
  invoke<boolean>("hide_to_tray_on_close");
