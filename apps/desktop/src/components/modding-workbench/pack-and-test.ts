import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { invoke } from "@tauri-apps/api/core";
import type { TFunction } from "i18next";
import type { useStartGame } from "@/components/providers/launch-repair";
import { invokeGuarded } from "@/lib/game-guard";
import { usePersistedStore } from "@/lib/store";
import { createProfileId, type VpkManifest } from "@/types/profiles";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingBuildResult } from "@/types/generated/ModdingBuildResult";

export type Phase = "compiling" | "installing" | "launching";
let packActive = false;

export async function packAndTest(
  addon: ModdingAddon,
  startGame: ReturnType<typeof useStartGame>,
  setPhase: (phase: Phase) => void,
  onCompiled: () => void,
  t: TFunction,
): Promise<ModdingBuildResult> {
  if (packActive) throw new RuntimeError(t("workbenchCompare.buildBusy"));
  packActive = true;
  try {
    setPhase("compiling");
    const build = await invoke<ModdingBuildResult>("build_modding_addon", {
      addonId: addon.id,
    });
    onCompiled();
    const store = usePersistedStore.getState();
    const profileId = createProfileId(
      `profile_0_workbench${addon.id.slice(0, 16)}`,
    );
    let profile = store.getProfile(profileId);
    if (!profile) {
      const name = t("workbenchExplorer.testProfile", { addon: addon.name });
      const folderName = await store.createImportProfileFolder(profileId, name);
      profile = {
        id: profileId,
        name,
        createdAt: new Date(),
        enabledMods: {},
        isDefault: false,
        folderName,
        mods: [],
      };
      store.upsertProfile(profile);
    }
    setPhase("installing");
    const existing = await invoke<VpkManifest>("get_profile_vpk_manifest", {
      profileFolder: profile.folderName,
    });
    if (existing.mods[build.modId]) {
      await invokeGuarded("replace_mod_vpks", {
        modId: build.modId,
        sourceVpkPaths: [build.outputPath],
        installedVpks: null,
        profileFolder: profile.folderName,
      });
    } else {
      await invokeGuarded("copy_local_mod_vpks", {
        modId: build.modId,
        profileFolder: profile.folderName,
        isMap: false,
      });
    }
    const manifest = await invoke<VpkManifest>("get_profile_vpk_manifest", {
      profileFolder: profile.folderName,
    });
    if (!manifest.mods[build.modId]?.enabled)
      await invokeGuarded("install_mod", {
        deadlockMod: {
          id: build.modId,
          name: addon.name,
          installed_vpks: [],
          original_vpk_names: [],
          file_tree: null,
          install_order: 0,
          is_map: false,
        },
        profileFolder: profile.folderName,
      });
    await usePersistedStore.getState().restoreModsFromManifest();
    const switched = await usePersistedStore
      .getState()
      .switchToProfile(profileId);
    if (switched.errors.length)
      throw new RuntimeError(switched.errors.join("\n"));
    setPhase("launching");
    const launched = await startGame({
      vanilla: false,
      additionalArgs: "",
      profileFolder: profile.folderName,
    });
    if (!launched)
      throw new RuntimeError(t("workbenchExplorer.launchCancelled"));
    return build;
  } finally {
    packActive = false;
  }
}
