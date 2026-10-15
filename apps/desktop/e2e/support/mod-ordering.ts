import { readFile } from "node:fs/promises";
import path from "node:path";
import { browser } from "@wdio/globals";
import { filesystemManifestSchema, filesystemPaths } from "./filesystem-oracle";
import { ALPHA } from "./profile-fixtures";

export const reorder = async (
  world: string,
  order: string[],
  crash = false,
  profileFolder = ALPHA.folder,
): Promise<string | null> => {
  const { citadel } = await filesystemPaths(world);
  const manifest = filesystemManifestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(citadel, "addons", profileFolder, ".dmm.json"),
        "utf8",
      ),
    ),
  );
  const data: Array<[string, string[], number]> = order.map((id, index) => [
    id,
    manifest.mods[id].currentVpks,
    index,
  ]);
  return browser.execute(
    async (folder, modOrderData, abrupt) => {
      if (abrupt) {
        window.setTimeout(() => {
          void window.__TAURI_INTERNALS__.invoke("reorder_mods_by_remote_id", {
            profileFolder: folder,
            modOrderData,
          });
        }, 100);
        return null;
      }
      try {
        await window.__TAURI_INTERNALS__.invoke("reorder_mods_by_remote_id", {
          profileFolder: folder,
          modOrderData,
        });
        return null;
      } catch (error) {
        return JSON.stringify(error);
      }
    },
    profileFolder,
    data,
    crash,
  );
};
