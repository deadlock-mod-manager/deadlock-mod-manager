import {
  profileTestBackend,
  modFor,
  snapshotFor,
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
