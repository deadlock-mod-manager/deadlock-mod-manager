import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { t } from "i18next";
import { getMod } from "@/lib/api-client";
import { usePersistedStore } from "@/lib/store";

/**
 * Puts a leftover parked file's mod back in the library, as Analyze used to do
 * on its own: a Downloaded catalog entry, with no file ownership recorded.
 */
export const addLeftoverToLibrary = async (
  remoteId: string,
  profileFolder: string | null,
): Promise<string> => {
  const mod = await getMod(remoteId);
  const store = usePersistedStore.getState();
  // The lookup can outlast a profile switch; the file belongs to the profile
  // that was analyzed.
  if ((store.getActiveProfile()?.folderName ?? null) !== profileFolder)
    throw new RuntimeError(t("addons.fileActions.profileChanged"));
  store.addIdentifiedLocalMod(mod, "", false);
  return mod.name;
};
