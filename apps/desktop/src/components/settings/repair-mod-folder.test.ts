import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as React from "react";
import { createProfileId, type ModProfile } from "@/types/profiles";
import type { ModFolderRepairReport } from "@/types/generated/ModFolderRepairReport";

const profile: ModProfile = {
  id: createProfileId("profile-test"),
  folderName: "profile_test",
  name: "Test",
  isDefault: false,
  createdAt: new Date(0),
  mods: [],
  enabledMods: {},
};
const report: ModFolderRepairReport = {
  applied: false,
  untrackedFiles: ["stray.vpk"],
  manifestStatus: "healthy",
  corruptManifestBackup: null,
  staging: [],
  quarantinedStaging: [],
  backupName: null,
  backupPath: null,
};
const calls: string[] = [];
let activeProfile: ModProfile | undefined = profile;
let failure = false;
let runMutation = async (
  _dryRun: boolean,
): Promise<ModFolderRepairReport | null> => null;
const invoke = mock(async () => {
  calls.push("repair");
  if (failure) throw new Error("Game is running");
  return report;
});
const guard = await import("@/lib/game-guard");
mock.module("@/lib/game-guard", () => ({ ...guard, invokeGuarded: invoke }));
mock.module("react", () => ({ ...React, useState: () => [null, () => {}] }));
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
mock.module("@tanstack/react-query", () => ({
  useMutation: (options: { mutationFn: typeof runMutation }) => {
    runMutation = options.mutationFn;
    return { isPending: false, mutate: () => {} };
  },
}));
mock.module("@/lib/store", () => ({
  usePersistedStore: {
    getState: () => ({
      getActiveProfile: () => activeProfile,
      restoreModsFromManifest: async () => {
        calls.push("restore");
      },
      syncProfileEnabledMods: async (id: string) => {
        calls.push(`sync:${id}`);
      },
    }),
  },
}));
mock.module("@/lib/logger", () => ({
  default: { withError: () => ({ error: () => {} }) },
}));
mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: () => null,
}));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { error: () => {} },
}));
mock.module("@deadlock-mods/ui/components/dialog", () => ({
  Dialog: () => null,
  DialogContent: () => null,
  DialogDescription: () => null,
  DialogFooter: () => null,
  DialogHeader: () => null,
  DialogTitle: () => null,
}));

const { RepairModFolder } = await import("./repair-mod-folder");

beforeEach(() => {
  calls.length = 0;
  invoke.mockClear();
  activeProfile = profile;
  failure = false;
  RepairModFolder();
});

describe("RepairModFolder mutation", () => {
  it("previews through the game guard without refreshing the library", async () => {
    expect(await runMutation(true)).toBe(report);
    expect(invoke).toHaveBeenCalledWith("repair_mod_folder", {
      profileFolder: profile.folderName,
      entries: [],
      dryRun: true,
    });
    expect(calls).toEqual(["repair"]);
  });

  it("refreshes manifest state before syncing enabled mods after applying", async () => {
    await runMutation(false);
    expect(invoke).toHaveBeenCalledWith("repair_mod_folder", {
      profileFolder: profile.folderName,
      entries: [],
      dryRun: false,
    });
    expect(calls).toEqual(["repair", "restore", `sync:${profile.id}`]);
  });

  it("leaves the library alone when the guarded command fails", async () => {
    failure = true;
    await expect(runMutation(false)).rejects.toThrow("Game is running");
    expect(calls).toEqual(["repair"]);
  });

  it("does nothing when there is no active profile", async () => {
    activeProfile = undefined;
    expect(await runMutation(false)).toBeNull();
    expect(calls).toEqual([]);
  });
});
