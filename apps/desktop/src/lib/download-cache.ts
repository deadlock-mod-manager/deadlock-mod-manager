import { invoke } from "@tauri-apps/api/core";
import type { DownloadCacheLocation } from "@/types/generated/DownloadCacheLocation";

export const getDownloadCacheLocation = (): Promise<DownloadCacheLocation> =>
  invoke<DownloadCacheLocation>("get_download_cache_location");

/** The folder holding every downloaded and imported mod, by mod id. */
export const getModsStorePath = async (): Promise<string> =>
  (await getDownloadCacheLocation()).path;
