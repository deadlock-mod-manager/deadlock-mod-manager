import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ErrorKind } from "@/types/tauri";
import { type LocalMod, ModStatus } from "@/types/mods";

const purge = mock(async (): Promise<void> => {});
const getModDownload = mock(async () => []);
const addToQueue = mock((item: { onComplete: () => void }) => {
  item.onComplete();
});
const install = mock(async () => {});

mock.module("@/lib/analytics", () => ({ analytics: {} }));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
const actualApi = await import("@/lib/api-client");
const actualGuard = await import("@/lib/game-guard");
const actualDownloads = await import("@/lib/download/manager");
mock.module("@/lib/game-guard", () => ({
  ...actualGuard,
  invokeGuarded: (command: string) => {
    if (command !== "purge_mod") {
      throw new Error(`Unexpected command ${command}`);
    }
    return purge();
  },
}));
mock.module("@/lib/api-client", () => ({ ...actualApi, getModDownload }));
mock.module("@/lib/download/manager", () => ({
  ...actualDownloads,
  downloadManager: { addToQueue },
}));
mock.module("@/lib/mods/read-mod-file-tree", () => ({
  readModFileTree: () => Promise.reject(new Error("No archive in tests")),
}));
mock.module("@/hooks/use-install-with-collection", () => ({
  default: () => ({ install }),
}));

const { useReinstallMod } = await import("./use-reinstall-mod");
const { usePersistedStore } = await import("@/lib/store");

const download = {
  name: "base.zip",
  url: "https://gamebanana.com/dl/base.zip",
  size: 10,
  md5Checksum: null,
  createdAt: null,
  updatedAt: null,
};

const mod: LocalMod = {
  id: "fixture",
  remoteId: "42",
  name: "Yamato Remodel",
  description: null,
  remoteUrl: "https://gamebanana.com/mods/42",
  category: "Skins",
  likes: 0,
  author: "Fixture",
  modAuthorId: null,
  downloadable: true,
  tags: [],
  images: [],
  hero: null,
  isAudio: false,
  isMap: false,
  audioUrl: null,
  downloadCount: 0,
  isNSFW: false,
  isObsolete: false,
  isBlacklisted: false,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  filesUpdatedAt: null,
  metadata: null,
  dependencies: null,
  overrides: null,
  createdAt: null,
  updatedAt: null,
  remoteAddedAt: new Date(0),
  remoteUpdatedAt: new Date(0),
  status: ModStatus.Installed,
  installedVpks: ["pak01_dir.vpk"],
  downloads: [download],
  selectedDownloads: [download],
};

const renderReinstall = () => {
  const hooks: ReturnType<typeof useReinstallMod>[] = [];
  const Probe = () => {
    hooks.push(useReinstallMod());
    return null;
  };
  renderToStaticMarkup(<Probe />);
  const hook = hooks[0];
  if (!hook) throw new Error("useReinstallMod did not render");
  return hook.reinstallMod;
};

const storedMod = () =>
  usePersistedStore
    .getState()
    .localMods.find((entry) => entry.remoteId === mod.remoteId);

// Status and VPK updates go through the active profile's mods, so the mod has
// to be there as well as in the library view.
const seedMods = (mods: LocalMod[]) => {
  const { activeProfileId, profiles } = usePersistedStore.getState();
  const profile = profiles[activeProfileId];
  if (!profile) throw new Error("No active profile");
  usePersistedStore.setState({
    localMods: mods,
    profiles: { ...profiles, [activeProfileId]: { ...profile, mods } },
  });
};

beforeEach(() => {
  purge.mockReset();
  getModDownload.mockClear();
  addToQueue.mockClear();
  install.mockClear();
  seedMods([mod]);
  usePersistedStore
    .getState()
    .setModEnabledInCurrentProfile(mod.remoteId, true);
});

afterEach(() => {
  usePersistedStore
    .getState()
    .setModEnabledInCurrentProfile(mod.remoteId, false);
  seedMods([]);
});

describe("reinstalling a mod whose files could not be removed", () => {
  const failures: [string, ErrorKind][] = [
    [
      "a read-only file the user kept read-only",
      {
        kind: "readOnlyFile",
        message: "File is read-only: /game/citadel/addons/pak01_dir.vpk",
        path: "/game/citadel/addons/pak01_dir.vpk",
      },
    ],
    [
      "an I/O error",
      { kind: "io", message: "Permission denied (os error 13)" },
    ],
  ];

  for (const [name, error] of failures) {
    it(`stops before downloading after ${name}`, async () => {
      purge.mockImplementation(() => Promise.reject(error));
      const steps: string[] = [];

      const settled = await renderReinstall()(mod, {
        onStep: (step) => steps.push(step),
      }).then(
        (result) => ({ result }),
        (thrown: ErrorKind) => ({ thrown }),
      );

      expect(steps).toEqual(["purging"]);
      expect(getModDownload).not.toHaveBeenCalled();
      expect(addToQueue).not.toHaveBeenCalled();
      expect(install).not.toHaveBeenCalled();
      expect(storedMod()?.installedVpks).toEqual(["pak01_dir.vpk"]);
      expect(storedMod()?.status).toBe(ModStatus.Installed);
      expect(
        usePersistedStore.getState().isModEnabledInCurrentProfile(mod.remoteId),
      ).toBe(true);
      expect(settled).toEqual({ thrown: error });
    });
  }

  it("downloads again once the purge succeeds", async () => {
    purge.mockImplementation(async () => {});
    const steps: string[] = [];

    const result = await renderReinstall()(mod, {
      onStep: (step) => steps.push(step),
    });

    expect(steps).toEqual(["purging", "downloading", "installing"]);
    expect(addToQueue).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(result.missingOnDisk).toBe(false);
  });
});
