import { invoke } from "@tauri-apps/api/core";

/**
 * Mirrors the "Faster downloads" setting into the backend, where downloads
 * run. Throws on failure so the caller can keep the displayed setting truthful.
 */
export const applySegmentedDownloadsSetting = async (
  enabled: boolean,
): Promise<void> => {
  await invoke("set_segmented_downloads", { enabled });
};
