import { invoke } from "@tauri-apps/api/core";

export const applySegmentedDownloadsSetting = async (
  enabled: boolean,
): Promise<void> => {
  await invoke("set_segmented_downloads", { enabled });
};
