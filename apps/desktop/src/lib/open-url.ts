import { openUrl as pluginOpenUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

let cachedPlatform: string | null = null;

async function getPlatform(): Promise<string> {
  if (cachedPlatform === null) {
    cachedPlatform = await platform();
  }
  return cachedPlatform;
}

export async function openUrl(url: string): Promise<void> {
  const os = await getPlatform();

  if (os === "linux") {
    await invoke("open_url", { url });
  } else {
    await pluginOpenUrl(url);
  }
}
