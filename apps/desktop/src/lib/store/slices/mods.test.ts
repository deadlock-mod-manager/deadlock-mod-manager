import { beforeEach, describe, expect, it, mock } from "bun:test";
import { create } from "zustand";

const noop = () => {};
const loggerMock = {
  withMetadata() {
    return this;
  },
  withError() {
    return this;
  },
  warn: noop,
  error: noop,
  info: noop,
  debug: noop,
};

mock.module("@/lib/logger", () => ({
  createLogger: () => loggerMock,
  default: loggerMock,
}));

import type { LocalMod, Progress } from "@/types/mods";
import { ModStatus } from "@/types/mods";
import type { ModProfile, ProfileId } from "@/types/profiles";
import { createProfileId } from "@/types/profiles";
import { createModsSlice, type ModsState } from "./mods";
import { placeholderModFromManifest } from "../utils/manifest-install-state";
import { clearProfileMods } from "@/lib/mods/recovery";

type TestState = ModsState & {
  profiles: Record<string, ModProfile>;
  activeProfileId: ProfileId;
  profileSyncRevisions: Record<ProfileId, number>;
  bumpProfileSyncRevision: (profileId: ProfileId) => number;
};

const modFor = (remoteId: string): LocalMod =>
  ({
    id: `mod_${remoteId}`,
    remoteId,
    name: `Mod ${remoteId}`,
    status: ModStatus.Installed,
    installedVpks: [`pak0${remoteId}_dir.vpk`],
  }) as LocalMod;

const progressFor = (
  percentage: number,
  bytes: { progressTotal: number; total: number },
): Progress => ({
  progress: bytes.progressTotal,
  progressTotal: bytes.progressTotal,
  total: bytes.total,
  transferSpeed: 1_000,
  percentage,
});

const profileFor = (id: string, remoteIds: string[]): ModProfile => ({
  id: createProfileId(id),
  name: id,
  createdAt: new Date(),
  enabledMods: Object.fromEntries(
    remoteIds.map((remoteId) => [
      remoteId,
      { remoteId, enabled: true, lastModified: new Date() },
    ]),
  ),
  isDefault: id === "default",
  folderName: id === "default" ? null : `profile_1_${id}`,
  mods: remoteIds.map(modFor),
});

const createTestStore = () =>
  create<TestState>()((set, get, store) => ({
    ...createModsSlice(
      set as Parameters<typeof createModsSlice>[0],
      get as Parameters<typeof createModsSlice>[1],
      store as Parameters<typeof createModsSlice>[2],
    ),
    profiles: {},
    activeProfileId: createProfileId("default"),
    profileSyncRevisions: {},
    bumpProfileSyncRevision: (profileId) => {
      const revisions = get().profileSyncRevisions;
      const next = (revisions[profileId] ?? 0) + 1;
      set({ profileSyncRevisions: { ...revisions, [profileId]: next } });
      return next;
    },
  }));

let store: ReturnType<typeof createTestStore>;

beforeEach(() => {
  store = createTestStore();
  store.setState({
    localMods: [modFor("1"), modFor("2")],
    modProgress: { "1": { percentage: 100 } },
    profiles: {
      default: profileFor("default", ["1", "2"]),
      secondary: profileFor("secondary", ["1"]),
    },
    activeProfileId: createProfileId("default"),
  });
});

describe("addLocalMod", () => {
  it("keeps existing named mods unchanged when the same remote mod is added", () => {
    const before = store.getState().profiles.default.mods;
    store.getState().addLocalMod({
      ...modFor("1"),
      id: "different-dto-id",
      name: "Replacement",
    });
    expect(store.getState().profiles.default.mods).toBe(before);
  });

  it("replaces a manifest placeholder when a local import finishes", () => {
    const id = "local-aa83cfac-def9-4a7a-820b-1e004e30ca29";
    const placeholder = placeholderModFromManifest(
      id,
      {
        shard: 1,
        enabled: false,
        currentVpks: [],
        disabledVpks: ["skin.vpk"],
        originalVpkNames: ["skin.vpk"],
        order: 3,
      },
      [],
    );
    store.setState({
      localMods: [placeholder],
      profiles: {
        ...store.getState().profiles,
        default: { ...profileFor("default", []), mods: [placeholder] },
      },
    });
    store.getState().addLocalMod(
      { ...placeholder, name: "My local skin" },
      {
        status: ModStatus.Downloaded,
      },
    );
    expect(store.getState().localMods).toHaveLength(1);
    expect(store.getState().localMods[0].name).toBe("My local skin");
    expect(store.getState().localMods[0].metadataPending).toBe(false);
    expect(store.getState().localMods[0].installOrder).toBe(3);
    expect(store.getState().profiles.default.mods).toEqual(
      store.getState().localMods,
    );
  });
});

describe("removeMod", () => {
  it("removes group membership only in the affected profile", () => {
    const group = {
      id: "cosmetics",
      name: "Cosmetics",
      modIds: ["1", "2"],
      collapsed: true,
    };
    const { profiles } = store.getState();
    store.setState({
      profiles: {
        default: { ...profiles.default, modGroups: [group] },
        secondary: { ...profiles.secondary, modGroups: [group] },
      },
    });
    store.getState().removeMod("1");
    expect(store.getState().profiles.default.modGroups?.[0].modIds).toEqual([
      "2",
    ]);
    expect(store.getState().profiles.secondary.modGroups?.[0].modIds).toEqual([
      "1",
      "2",
    ]);
    store.getState().clearMods();
    expect(store.getState().profiles.default.modGroups?.[0]).toMatchObject({
      name: "Cosmetics",
      modIds: [],
      collapsed: true,
    });
  });

  it("keeps group membership only for mods retained by a library reset", () => {
    const { profiles } = store.getState();
    store.setState({
      profiles: {
        ...profiles,
        default: {
          ...profiles.default,
          modGroups: [
            {
              id: "cosmetics",
              name: "Cosmetics",
              modIds: ["1", "2"],
              collapsed: false,
            },
          ],
        },
      },
    });
    store.getState().nukeModsState(["2"]);
    expect(store.getState().profiles.default.modGroups?.[0].modIds).toEqual([
      "2",
    ]);
  });

  it("preserves active progress and visibility when removing from another profile", () => {
    store.setState({ hiddenHeroMods: { "1": true } });
    const before = store.getState();
    store.getState().removeMod("1", createProfileId("secondary"));
    expect(store.getState().modProgress).toBe(before.modProgress);
    expect(store.getState().hiddenHeroMods).toBe(before.hiddenHeroMods);
    expect(store.getState().localMods).toBe(before.localMods);
    expect(store.getState().profiles.secondary.mods).toEqual([]);
  });

  it("preserves active progress and visibility when nuking another profile", () => {
    store.setState({ hiddenHeroMods: { "1": true } });
    const before = store.getState();
    store.getState().nukeModsState([], createProfileId("secondary"));
    expect(store.getState().modProgress).toBe(before.modProgress);
    expect(store.getState().hiddenHeroMods).toBe(before.hiddenHeroMods);
    expect(store.getState().localMods).toBe(before.localMods);
    expect(store.getState().profiles.secondary.mods).toEqual([]);
  });
  it("clears the mod from the active profile's enabled mods", () => {
    store.getState().removeMod("1");

    const active = store.getState().profiles.default;
    expect(active.enabledMods["1"]).toBeUndefined();
    expect(Object.keys(active.enabledMods)).toEqual(["2"]);
    expect(active.mods.map((mod) => mod.remoteId)).toEqual(["2"]);
    expect(store.getState().localMods.map((mod) => mod.remoteId)).toEqual([
      "2",
    ]);
    expect(store.getState().modProgress["1"]).toBeUndefined();
  });

  it("leaves other profiles alone, since their copy is still installed", () => {
    store.getState().removeMod("1");

    const secondary = store.getState().profiles.secondary;
    expect(secondary.enabledMods["1"]?.enabled).toBe(true);
    expect(secondary.mods.map((mod) => mod.remoteId)).toEqual(["1"]);
  });

  it("is a no-op on profiles that never had the mod enabled", () => {
    store.setState({
      profiles: {
        default: profileFor("default", ["2"]),
      },
    });

    store.getState().removeMod("1");

    expect(Object.keys(store.getState().profiles.default.enabledMods)).toEqual([
      "2",
    ]);
  });
});

describe("setModProgress", () => {
  it("preserves library, profiles, and other downloads during progress ticks", () => {
    const before = store.getState();
    store
      .getState()
      .setModProgress(
        "2",
        progressFor(25, { progressTotal: 250, total: 1000 }),
      );
    const after = store.getState();
    expect(after.localMods).toBe(before.localMods);
    expect(after.profiles).toBe(before.profiles);
    expect(after.modProgress["1"]).toBe(before.modProgress["1"]);
    expect(after.modProgress["2"].percentage).toBe(25);
  });

  it("reports the backend's percentage, not the byte ratio beside it", () => {
    store
      .getState()
      .setModProgress(
        "2",
        progressFor(25, { progressTotal: 900, total: 1000 }),
      );

    expect(store.getState().modProgress["2"].percentage).toBe(25);
  });

  it("reports it even when the byte ratio would not divide", () => {
    store
      .getState()
      .setModProgress("2", progressFor(25, { progressTotal: 900, total: 0 }));

    expect(store.getState().modProgress["2"].percentage).toBe(25);
  });

  it("keeps the slow clock running until the download speeds up", () => {
    const report = (transferSpeed: number) =>
      store.getState().setModProgress("2", {
        ...progressFor(25, { progressTotal: 900, total: 1000 }),
        transferSpeed,
      });

    report(1_000);
    const slowSince = store.getState().modProgress["2"].slowSince;
    expect(slowSince).toBeNumber();

    report(2_000);
    expect(
      store.getState().modProgress["2"].slowSince,
      "each slow report restarted the clock, so the notice never appeared",
    ).toBe(slowSince);

    report(10_000_000);
    expect(store.getState().modProgress["2"].slowSince).toBeUndefined();
  });
});

describe("clearMods", () => {
  it("empties the active profile's snapshot along with the library", () => {
    store.getState().clearMods();

    const active = store.getState().profiles.default;
    expect(store.getState().localMods).toEqual([]);
    expect(store.getState().modProgress).toEqual({});
    expect(active.mods).toEqual([]);
    expect(active.enabledMods).toEqual({});
  });

  it("leaves other profiles alone, since their copy is still installed", () => {
    store.getState().clearMods();

    const secondary = store.getState().profiles.secondary;
    expect(secondary.mods.map((mod) => mod.remoteId)).toEqual(["1"]);
    expect(secondary.enabledMods["1"]?.enabled).toBe(true);
  });

  it("still clears the library when there is no active profile", () => {
    store.setState({ profiles: {} });

    store.getState().clearMods();

    expect(store.getState().localMods).toEqual([]);
    expect(store.getState().profiles).toEqual({});
  });
});

describe("mod recovery", () => {
  const clear = (
    purgeMod: Parameters<typeof clearProfileMods>[0]["purgeMod"],
  ) => {
    const state = store.getState();
    return clearProfileMods({
      profile: state.profiles.default,
      mods: state.localMods,
      discardDownload: async () => {},
      purgeMod,
      removeMod: (remoteId, profileId) =>
        store.getState().removeMod(remoteId, profileId),
      bumpProfileSyncRevision: (profileId) =>
        store.getState().bumpProfileSyncRevision(profileId),
    });
  };

  it("reconciles each successful purge and retains failures for retry", async () => {
    const before = store.getState();
    const report = await clear(async ({ modId, profileFolder, vpks }) => {
      expect(profileFolder).toBeNull();
      expect(vpks).toEqual([`pak0${modId}_dir.vpk`]);
      if (modId === "2") {
        expect(store.getState().localMods.map((mod) => mod.remoteId)).toEqual([
          "2",
        ]);
        throw { kind: "io", message: "Access denied: C:/mods/2/archive.zip" };
      }
    });
    expect(report).toEqual({
      removed: 1,
      failures: [
        {
          remoteId: "2",
          name: "Mod 2",
          message: "Access denied: C:/mods/2/archive.zip",
        },
      ],
    });
    expect(store.getState().profiles.default.mods).toEqual([
      before.profiles.default.mods[1],
    ]);
    expect(Object.keys(store.getState().profiles.default.enabledMods)).toEqual([
      "2",
    ]);
    expect(store.getState().profiles.secondary).toBe(before.profiles.secondary);
    expect(
      store.getState().profileSyncRevisions[createProfileId("default")],
    ).toBeGreaterThan(0);
    const retry = await clear(async () => {});
    expect(retry).toEqual({ removed: 1, failures: [] });
    expect(store.getState().profiles.default.mods).toEqual([]);
  });

  it("does not offer repeated game overrides after the user keeps the block", async () => {
    let calls = 0;
    const report = await clear(async () => {
      calls += 1;
      throw {
        kind: "gameRunning",
        message: "Close Deadlock before removing files",
      };
    });
    expect(calls).toBe(1);
    expect(report.removed).toBe(0);
    expect(report.failures.map((failure) => failure.remoteId)).toEqual([
      "1",
      "2",
    ]);
    expect(store.getState().localMods).toHaveLength(2);
  });

  it("continues targeting the original profile if the active profile changes", async () => {
    const original = store.getState().profiles.secondary;
    await clear(async ({ profileFolder }) => {
      expect(profileFolder).toBeNull();
      store.setState({
        activeProfileId: createProfileId("secondary"),
        localMods: original.mods,
      });
    });
    expect(store.getState().profiles.default.mods).toEqual([]);
    expect(store.getState().profiles.secondary).toBe(original);
    expect(store.getState().localMods).toBe(original.mods);
  });

  it("keeps a mod when its download cannot be stopped", async () => {
    const state = store.getState();
    let purges = 0;
    const report = await clearProfileMods({
      profile: state.profiles.default,
      mods: state.localMods,
      discardDownload: async () => {
        throw new Error("Download is still writing archive.zip");
      },
      purgeMod: async () => {
        purges += 1;
      },
      removeMod: state.removeMod,
      bumpProfileSyncRevision: state.bumpProfileSyncRevision,
    });
    expect(purges).toBe(0);
    expect(report.failures).toHaveLength(2);
    expect(store.getState().localMods).toBe(state.localMods);
  });
});

const broken = (mods: LocalMod[]) =>
  mods.map((mod) => ({ ...mod, missingVpks: ["gone.vpk"] }));

describe("setInstalledVpks", () => {
  it("preserves unrelated mod references when installation completes", () => {
    store.setState((state) => ({ localMods: state.profiles.default.mods }));
    const before = store.getState();
    store.getState().setInstalledVpks("1", ["pak01_dir.vpk"]);
    const after = store.getState();
    expect(after.localMods[0]).not.toBe(before.localMods[0]);
    expect(after.localMods[1]).toBe(before.localMods[1]);
    expect(after.profiles.secondary).toBe(before.profiles.secondary);
    expect(after.localMods[0].installedVpks).toEqual(["pak01_dir.vpk"]);
  });

  const missing = (remoteId: string) =>
    store.getState().localMods.find((mod) => mod.remoteId === remoteId)
      ?.missingVpks;

  beforeEach(() => {
    store.setState((state) => ({
      localMods: broken(state.localMods),
      profiles: {
        ...state.profiles,
        default: {
          ...state.profiles.default,
          mods: broken(state.profiles.default.mods),
        },
      },
    }));
  });

  it("clears missing files once the mod is installed again", () => {
    store.getState().setInstalledVpks("1", ["pak01_dir.vpk"]);
    expect(missing("1")).toEqual([]);
    expect(missing("2")).toEqual(["gone.vpk"]);
  });

  it("keeps missing files while nothing is installed", () => {
    store.getState().setInstalledVpks("1", []);
    expect(missing("1")).toEqual(["gone.vpk"]);
  });
});

describe("markModUpdated", () => {
  it("keeps every mod's new date when a batch updates several", () => {
    const before = new Date(0);
    store.setState((state) => ({
      profiles: {
        ...state.profiles,
        default: {
          ...state.profiles.default,
          mods: state.profiles.default.mods.map((mod) => ({
            ...mod,
            downloadedAt: before,
          })),
        },
      },
    }));

    store.getState().markModUpdated("1");
    // Any later store action rebuilds localMods from the profile.
    store.getState().setInstalledVpks("2", ["pak02_dir.vpk"]);
    store.getState().markModUpdated("2");

    for (const mod of [
      ...store.getState().localMods,
      ...store.getState().profiles.default.mods,
    ]) {
      expect(new Date(mod.downloadedAt ?? 0).getTime()).toBeGreaterThan(0);
    }
  });
});

describe("restoreInterruptedUpdates", () => {
  it("only touches mods left mid-download", () => {
    store.setState((state) => ({
      profiles: {
        ...state.profiles,
        default: {
          ...state.profiles.default,
          mods: state.profiles.default.mods.map((mod) =>
            mod.remoteId === "1"
              ? { ...mod, status: ModStatus.Downloading }
              : mod,
          ),
        },
      },
    }));
    store.getState().restoreInterruptedUpdates(new Set(["1", "2"]));
    expect(store.getState().profiles.default.mods[0].status).toBe(
      ModStatus.Installed,
    );
    expect(store.getState().localMods[0].status).toBe(ModStatus.Installed);
  });
});

describe("disabled mod updates", () => {
  it("keeps completed updates disabled and refreshes the file timestamp", () => {
    const filesUpdatedAt = new Date();
    store
      .getState()
      .markModUpdated("1", undefined, ModStatus.Downloaded, filesUpdatedAt);
    for (const mods of [
      store.getState().localMods,
      store.getState().profiles.default.mods,
    ]) {
      expect(mods[0].status).toBe(ModStatus.Downloaded);
      expect(mods[0].downloadedAt).toBeInstanceOf(Date);
      expect(mods[0].filesUpdatedAt).toEqual(filesUpdatedAt);
    }
    expect(
      store.getState().profiles.secondary.mods[0].filesUpdatedAt,
    ).toBeUndefined();
  });

  it("restores each interrupted update to its previous enabled or disabled state", () => {
    store.getState().setModStatus("1", ModStatus.Downloaded);
    store.getState().setModStatus("1", ModStatus.Downloading);
    store.getState().setModStatus("2", ModStatus.Downloading);
    store.getState().restoreInterruptedUpdates(
      new Set(["1", "2"]),
      undefined,
      new Map([
        ["1", ModStatus.Downloaded],
        ["2", ModStatus.Installed],
      ]),
    );
    expect(store.getState().localMods.map((mod) => mod.status)).toEqual([
      ModStatus.Downloaded,
      ModStatus.Installed,
    ]);
    expect(store.getState().profiles.default.mods).toEqual(
      store.getState().localMods,
    );
  });
});

describe("download metadata updates", () => {
  it.each(["selected downloads", "downloads", "variant", "order"])(
    "preserves unrelated mod references for %s",
    (field) => {
      store.setState((state) => ({ localMods: state.profiles.default.mods }));
      const before = store.getState();
      if (field === "selected downloads") before.setSelectedDownloads("1", []);
      else if (field === "downloads") before.setModDownloads("1", []);
      else if (field === "variant")
        before.setActiveVariantArchive("1", "variant.zip");
      else before.setModOrder("1", 4);
      const after = store.getState();
      expect(after.localMods[0]).not.toBe(before.localMods[0]);
      expect(after.localMods[1]).toBe(before.localMods[1]);
      expect(after.profiles.secondary).toBe(before.profiles.secondary);
    },
  );
});
