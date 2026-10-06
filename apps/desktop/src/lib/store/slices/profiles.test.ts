import {
  profileTestBackend,
  modFor,
  snapshotFor,
  snapshotMissing,
} from "./profiles.test-support";
import { beforeEach, describe, expect, it } from "bun:test";
import { create } from "zustand";
import type { ModDto } from "@deadlock-mods/shared";
import { ModStatus, type LocalMod } from "@/types/mods";
import {
  createProfileId,
  type ModProfile,
  type ProfileVpkSnapshot,
} from "@/types/profiles";
import type { ProfilesState } from "./profiles";

// Bun evaluates static imports before module mocks; load the slice after its IPC/API mocks.
const { createProfilesSlice } = await import("./profiles");

const profileFor = (id: string, mods: LocalMod[] = []): ModProfile => ({
  id: createProfileId(id),
  name: id,
  createdAt: new Date(0),
  enabledMods: {},
  isDefault: id === "default",
  folderName: id === "default" ? null : id,
  mods,
});
const createTestStore = () =>
  create<ProfilesState & { localMods: LocalMod[] }>()((set, get, api) => ({
    ...createProfilesSlice(set, get, api),
    localMods: [],
  }));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  profileTestBackend.readSnapshot = async () => snapshotFor();
  profileTestBackend.readMetadata = async (id) => modFor(id);
  profileTestBackend.forgetOrphans = async (_folder, modIds) => modIds;
});

const installedMod = (): LocalMod => ({
  ...modFor("42"),
  status: ModStatus.Installed,
  installedVpks: ["pak01_dir.vpk"],
});

const trackInstalled = (store: ReturnType<typeof createTestStore>) => {
  const mod = installedMod();
  store.setState({
    profiles: {
      default: {
        ...profileFor("default", [mod]),
        enabledMods: {
          "42": { remoteId: "42", enabled: true, lastModified: new Date(0) },
        },
      },
    },
    localMods: [mod],
  });
};

describe("mods whose VPKs were deleted", () => {
  it("removes a mod whose every VPK is gone and reports its name", async () => {
    const store = createTestStore();
    trackInstalled(store);
    const forgotten: string[][] = [];
    profileTestBackend.readSnapshot = async () =>
      snapshotMissing(["original.vpk"], true);
    profileTestBackend.forgetOrphans = async (_folder, modIds) => {
      forgotten.push(modIds);
      return modIds;
    };
    expect(await store.getState().restoreModsFromManifest()).toEqual([
      "Mod 42",
    ]);
    expect(forgotten).toEqual([["42"]]);
    expect(store.getState().localMods).toEqual([]);
    expect(store.getState().profiles.default.mods).toEqual([]);
    expect(store.getState().profiles.default.enabledMods).toEqual({});
  });

  it("keeps a mod the backend no longer considers orphaned", async () => {
    const store = createTestStore();
    trackInstalled(store);
    profileTestBackend.readSnapshot = async () =>
      snapshotMissing(["original.vpk"], true);
    profileTestBackend.forgetOrphans = async () => [];
    expect(await store.getState().restoreModsFromManifest()).toEqual([]);
    expect(store.getState().localMods).toHaveLength(1);
  });

  it("does not restore an orphaned manifest entry the store never had", async () => {
    const store = createTestStore();
    profileTestBackend.readSnapshot = async () =>
      snapshotMissing(["original.vpk"], true);
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods).toEqual([]);
  });

  it("leaves an orphaned mod alone while it is being installed", async () => {
    const store = createTestStore();
    const installing = { ...modFor("42"), status: ModStatus.Installing };
    store.setState({
      profiles: { default: profileFor("default", [installing]) },
      localMods: [installing],
    });
    profileTestBackend.readSnapshot = async () =>
      snapshotMissing(["original.vpk"], true);
    profileTestBackend.forgetOrphans = async () => {
      throw new Error("A mod being installed must not be forgotten");
    };
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods).toEqual([installing]);
  });

  it("flags a mod that lost some files, and clears the flag once they return", async () => {
    const store = createTestStore();
    trackInstalled(store);
    profileTestBackend.readSnapshot = async () =>
      snapshotMissing(["original.vpk"], false);
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods[0].missingVpks).toEqual(["original.vpk"]);
    expect(store.getState().profiles.default.mods[0].missingVpks).toEqual([
      "original.vpk",
    ]);

    profileTestBackend.readSnapshot = async () => snapshotFor();
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods[0].missingVpks).toEqual([]);
    expect(store.getState().localMods[0].status).toBe(ModStatus.Installed);
  });

  it("runs overlapping reconciliations one after another", async () => {
    const store = createTestStore();
    trackInstalled(store);
    const first = deferred<ProfileVpkSnapshot>();
    let reads = 0;
    profileTestBackend.readSnapshot = () => {
      reads += 1;
      return reads === 1
        ? first.promise
        : Promise.resolve(snapshotMissing(["original.vpk"], true));
    };
    const earlier = store.getState().restoreModsFromManifest();
    const later = store.getState().restoreModsFromManifest();
    await Promise.resolve();
    expect(reads).toBe(1);
    first.resolve(snapshotFor());
    await earlier;
    expect(await later).toEqual(["Mod 42"]);
  });
});

describe("profile snapshot reconciliation", () => {
  it("allows overlapping syncs for different profiles", async () => {
    const store = createTestStore();
    store.setState({
      profiles: {
        default: profileFor("default", [modFor("42")]),
        secondary: profileFor("secondary", [modFor("42")]),
      },
    });
    const first = deferred<ProfileVpkSnapshot>();
    profileTestBackend.readSnapshot = (folder) =>
      folder === null ? first.promise : Promise.resolve(snapshotFor());
    const pending = store
      .getState()
      .syncProfileEnabledMods(createProfileId("default"));
    await store.getState().syncProfileEnabledMods(createProfileId("secondary"));
    first.resolve(snapshotFor());
    await pending;
    expect(store.getState().profiles.default.mods[0].status).toBe(
      ModStatus.Installed,
    );
    expect(store.getState().profiles.secondary.mods[0].status).toBe(
      ModStatus.Installed,
    );
  });

  it("rejects a stale sync for the same profile", async () => {
    const store = createTestStore();
    store.setState({
      profiles: { default: profileFor("default", [modFor("42")]) },
    });
    const first = deferred<ProfileVpkSnapshot>();
    profileTestBackend.readSnapshot = () => first.promise;
    const pending = store
      .getState()
      .syncProfileEnabledMods(createProfileId("default"));
    store.getState().bumpProfileSyncRevision(createProfileId("default"));
    first.resolve(snapshotFor());
    await pending;
    expect(store.getState().profiles.default.mods[0].status).toBe(
      ModStatus.Downloaded,
    );
  });

  it("does not restore installed status from a VPK in the wrong shard", async () => {
    const store = createTestStore();
    profileTestBackend.readSnapshot = async () => snapshotFor("42", 2);
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods[0].status).toBe(ModStatus.Downloaded);
    expect(store.getState().localMods[0].installedVpks).toEqual([]);
    expect(store.getState().profiles.default.enabledMods).toEqual({});
  });

  it("refreshes placeholder metadata on a later restoration", async () => {
    const store = createTestStore();
    profileTestBackend.readMetadata = async () => {
      throw new Error("Catalog temporarily unavailable");
    };
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods[0].metadataPending).toBe(true);
    expect(store.getState().localMods[0].status).toBe(ModStatus.Installed);
    profileTestBackend.readMetadata = async (id) => modFor(id);
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods).toHaveLength(1);
    expect(store.getState().localMods[0].name).toBe("Mod 42");
    expect(store.getState().localMods[0].metadataPending).toBe(false);
    expect(store.getState().localMods[0].installedVpks).toEqual([
      "pak01_dir.vpk",
    ]);
  });

  it("validates files for placeholders when metadata is unavailable", async () => {
    const store = createTestStore();
    profileTestBackend.readSnapshot = async () => ({
      ...snapshotFor(),
      files: [],
    });
    profileTestBackend.readMetadata = async () => {
      throw new Error("Offline");
    };
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods[0].metadataPending).toBe(true);
    expect(store.getState().localMods[0].status).toBe(ModStatus.Downloaded);
  });

  it("merges into current profile state after waiting for metadata", async () => {
    const store = createTestStore();
    const started = deferred<void>();
    const metadata = deferred<ModDto>();
    profileTestBackend.readMetadata = () => {
      started.resolve();
      return metadata.promise;
    };
    const pending = store.getState().restoreModsFromManifest();
    await started.promise;
    const concurrent = modFor("99");
    store.setState({
      profiles: { default: profileFor("default", [concurrent]) },
      localMods: [concurrent],
    });
    metadata.resolve(modFor("42"));
    await pending;
    expect(store.getState().localMods.map((mod) => mod.remoteId)).toEqual([
      "99",
      "42",
    ]);
  });

  it("repairs a tracked mod whose install state lost the manifest's VPKs", async () => {
    const store = createTestStore();
    const stale = {
      ...modFor("42"),
      status: ModStatus.Downloading,
      installedVpks: undefined,
    };
    store.setState({
      profiles: { default: profileFor("default", [stale]) },
      localMods: [stale],
    });
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods).toHaveLength(1);
    expect(store.getState().localMods[0].status).toBe(ModStatus.Installed);
    expect(store.getState().localMods[0].installedVpks).toEqual([
      "pak01_dir.vpk",
    ]);
    expect(store.getState().profiles.default.enabledMods["42"]?.enabled).toBe(
      true,
    );
  });

  it("drops install state the manifest's files no longer back", async () => {
    const store = createTestStore();
    profileTestBackend.readSnapshot = async () => ({
      ...snapshotFor(),
      files: [],
    });
    const installed = {
      ...modFor("42"),
      status: ModStatus.Installed,
      installedVpks: ["pak01_dir.vpk"],
    };
    store.setState({
      profiles: { default: profileFor("default", [installed]) },
      localMods: [installed],
    });
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods[0].status).toBe(ModStatus.Downloaded);
    expect(store.getState().localMods[0].installedVpks).toEqual([]);
    expect(store.getState().profiles.default.enabledMods["42"]).toBeUndefined();
  });

  it("repairs a profile the user is not in, without a catalog lookup", async () => {
    const store = createTestStore();
    const healthy = {
      ...modFor("42"),
      status: ModStatus.Installed,
      installedVpks: ["pak01_dir.vpk"],
    };
    const stale = { ...modFor("42"), status: ModStatus.Downloading };
    store.setState({
      profiles: {
        default: profileFor("default", [healthy]),
        secondary: profileFor("secondary", [stale]),
      },
      localMods: [healthy],
    });
    profileTestBackend.readMetadata = async () => {
      throw new Error("A repair must not consult the catalog");
    };
    await store.getState().restoreModsFromManifest();
    const repaired = store.getState().profiles.secondary;
    expect(repaired.mods[0].status).toBe(ModStatus.Installed);
    expect(repaired.mods[0].installedVpks).toEqual(["pak01_dir.vpk"]);
    expect(repaired.enabledMods["42"]?.enabled).toBe(true);
    expect(store.getState().localMods).toEqual([healthy]);
  });

  it("leaves a tracked mod alone while it is being installed", async () => {
    const store = createTestStore();
    const installing = {
      ...modFor("42"),
      status: ModStatus.Installing,
      installedVpks: undefined,
    };
    store.setState({
      profiles: { default: profileFor("default", [installing]) },
      localMods: [installing],
    });
    await store.getState().restoreModsFromManifest();
    expect(store.getState().localMods[0].status).toBe(ModStatus.Installing);
    expect(store.getState().localMods[0].installedVpks).toBeUndefined();
  });

  it("does not resurrect a mod removed during metadata lookup", async () => {
    const store = createTestStore();
    const started = deferred<void>();
    const metadata = deferred<ModDto>();
    profileTestBackend.readMetadata = () => {
      started.resolve();
      return metadata.promise;
    };
    const pending = store.getState().restoreModsFromManifest();
    await started.promise;
    store.getState().bumpProfileSyncRevision(createProfileId("default"));
    metadata.resolve(modFor("42"));
    await pending;
    expect(store.getState().localMods).toEqual([]);
  });
});
