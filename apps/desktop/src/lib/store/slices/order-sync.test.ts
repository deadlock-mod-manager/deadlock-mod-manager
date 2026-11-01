import {
  modFor,
  profileTestBackend,
  snapshotFor,
} from "./profiles.test-support";
import { describe, expect, it } from "bun:test";
import { create } from "zustand";
import { ModStatus, type LocalMod } from "@/types/mods";
import { createProfileId, type ProfileVpkSnapshot } from "@/types/profiles";
import type { ModsState } from "./mods";
import type { ProfilesState } from "./profiles";

// Load the slices after the shared IPC/API mocks, as in profiles.test.ts.
const { createModsSlice } = await import("./mods");
const { createProfilesSlice } = await import("./profiles");

const profileId = createProfileId("default");
const createTestStore = () => {
  const store = create<ModsState & ProfilesState>()((set, get, api) => ({
    ...createModsSlice(set, get, api),
    ...createProfilesSlice(set, get, api),
  }));
  const mod: LocalMod = {
    ...modFor("42"),
    status: ModStatus.Installed,
    installedVpks: ["pak01_dir.vpk"],
    installOrder: 0,
    installedFileTree: {
      files: ["first.vpk", "second.vpk"].map((name) => ({
        name,
        path: name,
        size: 1,
        is_selected: true,
        archive_name: "mod.zip",
      })),
      total_files: 2,
      has_multiple_files: true,
    },
  };
  const mods: LocalMod[] = [
    mod,
    {
      ...modFor("43"),
      status: ModStatus.Installed,
      installedVpks: ["pak02_dir.vpk"],
      installOrder: 1,
    },
  ];
  store.setState((state) => ({
    localMods: mods,
    profiles: {
      [profileId]: { ...state.profiles[profileId], mods },
    },
  }));
  return store;
};

describe("saved mod order during profile reconciliation", () => {
  it("keeps the saved order when an earlier filesystem snapshot arrives", async () => {
    const store = createTestStore();
    const snapshot = Promise.withResolvers<ProfileVpkSnapshot>();
    profileTestBackend.readSnapshot = () => snapshot.promise;
    const pending = store.getState().syncProfileEnabledMods(profileId);

    store.getState().reorderMods(["43", "42"], profileId);
    snapshot.resolve(snapshotFor());
    await pending;

    expect(store.getState().localMods[0].installOrder).toBe(1);
    expect(store.getState().profiles[profileId].mods[0].installOrder).toBe(1);
  });

  it("keeps renamed VPK mappings when an earlier filesystem snapshot arrives", async () => {
    const store = createTestStore();
    const snapshot = Promise.withResolvers<ProfileVpkSnapshot>();
    profileTestBackend.readSnapshot = () => snapshot.promise;
    const pending = store.getState().syncProfileEnabledMods(profileId);

    store
      .getState()
      .updateModVpksAfterReorder([["42", ["pak02_dir.vpk"]]], profileId);
    snapshot.resolve(snapshotFor());
    await pending;

    expect(store.getState().localMods[0].installedVpks).toEqual([
      "pak02_dir.vpk",
    ]);
    expect(store.getState().profiles[profileId].mods[0].installedVpks).toEqual([
      "pak02_dir.vpk",
    ]);
  });

  it("keeps a single mod's saved position when an earlier snapshot arrives", async () => {
    const store = createTestStore();
    const snapshot = Promise.withResolvers<ProfileVpkSnapshot>();
    profileTestBackend.readSnapshot = () => snapshot.promise;
    const pending = store.getState().syncProfileEnabledMods(profileId);

    store.getState().setModOrder("42", 3, profileId);
    snapshot.resolve(snapshotFor());
    await pending;

    expect(store.getState().localMods[0].installOrder).toBe(3);
    expect(store.getState().profiles[profileId].mods[0].installOrder).toBe(3);
  });

  it("keeps the saved file order when an earlier filesystem snapshot arrives", async () => {
    const store = createTestStore();
    const snapshot = Promise.withResolvers<ProfileVpkSnapshot>();
    profileTestBackend.readSnapshot = () => snapshot.promise;
    const pending = store.getState().syncProfileEnabledMods(profileId);

    store.getState().setModFileOrder("42", ["second.vpk", "first.vpk"]);
    snapshot.resolve(snapshotFor());
    await pending;

    expect(
      store
        .getState()
        .localMods[0].installedFileTree?.files.map((file) => file.name),
    ).toEqual(["second.vpk", "first.vpk"]);
    expect(
      store
        .getState()
        .profiles[profileId].mods[0].installedFileTree?.files.map(
          (file) => file.name,
        ),
    ).toEqual(["second.vpk", "first.vpk"]);
  });
});

describe("clearing mod state", () => {
  it("does not repopulate the cleared library from an earlier scan", async () => {
    const store = createTestStore();
    const snapshot = Promise.withResolvers<ProfileVpkSnapshot>();
    profileTestBackend.readSnapshot = () => snapshot.promise;
    const pending = store.getState().syncProfileEnabledMods(profileId);

    store.getState().clearMods();
    snapshot.resolve(snapshotFor());
    await pending;

    expect(store.getState().localMods).toEqual([]);
    expect(store.getState().profiles[profileId].mods).toEqual([]);
    expect(store.getState().profiles[profileId].enabledMods).toEqual({});
  });

  it("clears DMM records and restores ownership from the unchanged manifest", async () => {
    const store = createTestStore();
    const secondaryId = createProfileId("secondary");
    const secondary = {
      ...store.getState().profiles[profileId],
      id: secondaryId,
      isDefault: false,
      folderName: "secondary",
    };
    store.setState((state) => ({
      profiles: { ...state.profiles, [secondaryId]: secondary },
    }));
    const snapshot = snapshotFor();
    snapshot.manifest.mods["43"] = {
      ...snapshot.manifest.mods["42"],
      currentVpks: ["pak02_dir.vpk"],
      order: 1,
    };
    snapshot.files.push({
      shard: 1,
      filename: "pak02_dir.vpk",
      locator: "pak02_dir.vpk",
    });
    const manifestBefore = structuredClone(snapshot.manifest);
    let scans = 0;
    profileTestBackend.readSnapshot = async () => {
      scans += 1;
      return snapshot;
    };

    store.getState().clearMods();

    expect(store.getState().localMods).toEqual([]);
    expect(store.getState().profiles[profileId].mods).toEqual([]);
    expect(store.getState().profiles[secondaryId]).toBe(secondary);
    expect(scans).toBe(0);
    expect(snapshot.manifest).toEqual(manifestBefore);

    await store.getState().restoreModsFromManifest();

    expect(
      store.getState().localMods.map((mod) => ({
        id: mod.remoteId,
        vpks: mod.installedVpks,
      })),
    ).toEqual([
      { id: "42", vpks: ["pak01_dir.vpk"] },
      { id: "43", vpks: ["pak02_dir.vpk"] },
    ]);
    expect(snapshot.manifest).toEqual(manifestBefore);
    expect(
      store.getState().profiles[secondaryId].mods.map((mod) => mod.remoteId),
    ).toEqual(["42", "43"]);
  });
});
