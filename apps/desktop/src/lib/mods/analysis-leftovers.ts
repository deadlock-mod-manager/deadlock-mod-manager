import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { t } from "i18next";
import { getMod } from "@/lib/api-client";
import { usePersistedStore } from "@/lib/store";

export const addLeftoverToLibrary = async (
  remoteId: string,
  profileFolder: string | null,
): Promise<string> => {
  const mod = await getMod(remoteId);
  const store = usePersistedStore.getState();
  if ((store.getActiveProfile()?.folderName ?? null) !== profileFolder)
    throw new RuntimeError(t("addons.fileActions.profileChanged"));
  store.addIdentifiedLocalMod(mod, "", false);
  return mod.name;
};
