import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ModDto } from "@deadlock-mods/shared";
import { ModStatus } from "@/types/mods";
import { createProfileId } from "@/types/profiles";

let lookup: () => Promise<ModDto>;
mock.module("@/lib/analytics", () => ({ analytics: {} }));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
const apiClient = await import("@/lib/api-client");
mock.module("@/lib/api-client", () => ({
  ...apiClient,
  getMod: () => lookup(),
}));

const { addLeftoverToLibrary } = await import("./analysis-leftovers");
const { usePersistedStore } = await import("@/lib/store");
const { placeholderModFromManifest } =
  await import("@/lib/store/utils/manifest-install-state");

const ALPHA = createProfileId("profile_1_alpha");
const BETA = createProfileId("profile_2_beta");
const profile = (id: typeof ALPHA, folderName: string) => ({
  id,
  name: folderName,
  description: "",
  folderName,
  isDefault: false,
  createdAt: new Date(0),
  lastUsed: new Date(0),
  mods: [],
  enabledMods: {},
});
const catalogMod: ModDto = {
  ...placeholderModFromManifest(
    "900001",
    {
      enabled: false,
      shard: 1,
      currentVpks: [],
      disabledVpks: ["900001_green.vpk"],
      originalVpkNames: [],
    },
    [],
  ),
  name: "E2E GameBanana Mod",
};

const setUp = () =>
  usePersistedStore.setState({
    activeProfileId: ALPHA,
    localMods: [],
    profiles: {
      [ALPHA]: profile(ALPHA, "alpha"),
      [BETA]: profile(BETA, "beta"),
    },
  });

afterEach(() => usePersistedStore.setState({ localMods: [], profiles: {} }));

describe("adding a leftover parked file's mod", () => {
  it("adds the catalog mod as downloaded, the way Analyze used to", async () => {
    setUp();
    lookup = async () => catalogMod;
    expect(await addLeftoverToLibrary("900001", "alpha")).toBe(
      "E2E GameBanana Mod",
    );
    const [mod] = usePersistedStore.getState().localMods;
    expect(mod?.remoteId).toBe("900001");
    expect(mod?.status).toBe(ModStatus.Downloaded);
    expect(mod?.installedVpks).toEqual([]);
  });

  it("adds nothing when the profile changed during the lookup", async () => {
    setUp();
    let finish!: (mod: ModDto) => void;
    const pending = new Promise<ModDto>((resolve) => {
      finish = resolve;
    });
    lookup = () => pending;
    const adding = addLeftoverToLibrary("900001", "alpha");
    usePersistedStore.setState({ activeProfileId: BETA });
    finish(catalogMod);
    await expect(adding).rejects.toThrow();
    expect(usePersistedStore.getState().localMods).toEqual([]);
  });
});
