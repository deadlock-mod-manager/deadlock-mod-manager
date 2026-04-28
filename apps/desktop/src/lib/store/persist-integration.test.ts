import { beforeEach, describe, expect, it, mock } from "bun:test";

const memory = new Map<string, string>();

mock.module("@tauri-apps/plugin-store", () => ({
  getStore: async () => ({
    get: async (k: string) => memory.get(k),
    set: async (k: string, v: string) => {
      memory.set(k, v);
    },
    delete: async (k: string) => {
      memory.delete(k);
    },
  }),
}));

mock.module("@/lib/logger", () => {
  const noop = () => undefined;
  const make = (): Record<string, unknown> => {
    const obj: Record<string, unknown> = {};
    obj.withMetadata = () => make();
    obj.withError = () => make();
    obj.warn = noop;
    obj.error = noop;
    obj.info = noop;
    obj.debug = noop;
    obj.trace = noop;
    return obj;
  };
  return { default: make() };
});

// Stub Tauri IPC. The store imports through to slices that import @tauri-apps/api/core.
mock.module("@tauri-apps/api/core", () => ({
  invoke: async () => undefined,
}));

mock.module("@tauri-apps/plugin-log", () => ({
  debug: () => {},
  error: () => {},
  info: () => {},
  trace: () => {},
  warn: () => {},
}));

// Stub the plugins module: real implementation calls `import.meta.glob` which
// only Vite understands (bun returns undefined). The slice only uses
// getPlugins() inside the `setEnabledPlugin` action, never during hydration.
mock.module("@/lib/plugins", () => ({
  getPlugins: () => [],
}));

// Production-shaped state fragment (anonymized) representing a real user
// currently on schema version 15. We only seed the fields relevant to the
// idempotent migration assertions below.
const seededState = {
  localMods: [
    { id: "mod_a", remoteId: "1", name: "A", status: "downloaded" },
    { id: "mod_b", remoteId: "2", name: "B", status: "installed" },
  ],
  defaultSort: "last updated",
  profiles: {
    default: {
      id: "default",
      name: "Default Profile",
      description: "The default mod profile",
      createdAt: "2026-04-20T20:20:29.826Z",
      lastUsed: "2026-04-20T20:20:29.826Z",
      enabledMods: {
        "1": { remoteId: "1", enabled: true, lastModified: "2026-04-20" },
      },
      isDefault: true,
      folderName: null,
      mods: [
        { id: "mod_a", remoteId: "1", name: "A", status: "downloaded" },
        { id: "mod_b", remoteId: "2", name: "B", status: "installed" },
      ],
    },
  },
  activeProfileId: "default",
  gamePath: "V:\\SteamLibrary\\steamapps\\common\\Deadlock",
  settings: {},
  nsfwSettings: {
    hideNSFW: false,
    blurStrength: 16,
    showLikelyNSFW: false,
    rememberPerItemOverrides: true,
    disableBlur: false,
  },
  telemetrySettings: { analyticsEnabled: false },
  perItemNSFWOverrides: {},
  developerMode: false,
  ingestToolEnabled: true,
  autoUpdateEnabled: true,
  crosshairsEnabled: true,
  linuxGpuOptimization: "auto",
  enabledPlugins: {},
  backupEnabled: true,
  maxBackupCount: 5,
  fileserverPreference: "default",
  fileserverLatencyMs: { server1: 42, server2: 88 },
  audioVolume: 50,
  modsFilters: {
    selectedCategories: [],
    selectedHeroes: [],
    audioQuickFilter: "off",
    mapQuickFilter: "off",
    hideNSFW: false,
    hideOutdated: false,
    currentSort: "download count",
    timePeriod: "all time",
    filterMode: "include",
    searchQuery: "",
  },
  crosshairFilters: {
    selectedHeroes: [],
    selectedTags: [],
    currentSort: "last updated",
    filterMode: "include",
    searchQuery: "",
  },
  hasCompletedOnboarding: true,
  pluginSettings: {},
  scrollPositions: { "/mods": 0 },
  activeCrosshair: null,
  activeCrosshairHistory: [],
  stagedServers: {},
  lastServerJoin: null,
  proxyConfig: {
    enabled: false,
    protocol: "http",
    host: "",
    port: 8080,
    authEnabled: false,
    username: "",
    password: "",
    noProxy: "",
  },
  showOccultGeometry: true,
  animateOccultGeometry: true,
};

const seedFromVersion = (version: number, state: unknown) => {
  memory.clear();
  memory.set("local-config", JSON.stringify({ state, version }));
};

const importStoreFreshly = async () => {
  // Reset the storage module's gate. The store module itself is reused across
  // tests because zustand's `persist.rehydrate()` rebuilds in-memory state on
  // each call from the seeded backing store, so we don't need to re-evaluate.
  const storageModule = await import("./storage");
  storageModule.__resetForTests();
  const storeModule = await import("./index");
  return storeModule;
};

describe("persisted store integration with real production fixture", () => {
  beforeEach(() => {
    memory.clear();
  });

  it("upgrading from v15 with populated state preserves all user-set settings", async () => {
    seedFromVersion(15, seededState);
    const { usePersistedStore } = await importStoreFreshly();
    await usePersistedStore.persist.rehydrate();

    const s = usePersistedStore.getState();

    // Every field that the buggy unconditional-assign migration steps would
    // have clobbered on the upgrade from v15 -> v18 must survive.
    expect(s.proxyConfig).toEqual(seededState.proxyConfig);
    expect(s.fileserverLatencyMs).toEqual(seededState.fileserverLatencyMs);
    expect(s.fileserverPreference).toBe(seededState.fileserverPreference);
    expect(s.nsfwSettings).toEqual(seededState.nsfwSettings);
    expect(s.modsFilters).toEqual(seededState.modsFilters);
    expect(s.crosshairFilters).toEqual(seededState.crosshairFilters);
    expect(s.linuxGpuOptimization).toBe(seededState.linuxGpuOptimization);
    expect(s.backupEnabled).toBe(seededState.backupEnabled);
    expect(s.maxBackupCount).toBe(seededState.maxBackupCount);
    expect(s.showOccultGeometry).toBe(seededState.showOccultGeometry);
    expect(s.animateOccultGeometry).toBe(seededState.animateOccultGeometry);
    expect(s.gamePath).toBe(seededState.gamePath);

    // Local mod and profile mod arrays survive the migration with their length.
    expect(s.localMods.length).toBe(seededState.localMods.length);
    const profile = s.profiles.default;
    expect(profile).toBeDefined();
    expect(profile?.mods.length).toBe(seededState.profiles.default.mods.length);
  });

  it("deep merge picks up new defaults inside opted-in nested objects (proxyConfig)", async () => {
    // Simulate a persisted state that was written before `noProxy` existed.
    const partialProxy = { ...seededState.proxyConfig } as Record<
      string,
      unknown
    >;
    delete partialProxy.noProxy;
    seedFromVersion(19, {
      ...seededState,
      proxyConfig: partialProxy,
    });

    const { usePersistedStore } = await importStoreFreshly();
    await usePersistedStore.persist.rehydrate();

    const merged = usePersistedStore.getState().proxyConfig;
    // Existing seeded fields are preserved.
    expect(merged.enabled).toBe(false);
    expect(merged.protocol).toBe("http");
    // Missing field picks up its default.
    expect(merged.noProxy).toBe("");
  });

  it("malformed state.profiles does not nuke other persisted keys", async () => {
    seedFromVersion(18, {
      ...seededState,
      profiles: "not-an-object", // intentionally corrupt
    });

    const { usePersistedStore } = await importStoreFreshly();
    await usePersistedStore.persist.rehydrate();

    const s = usePersistedStore.getState();
    expect(s.gamePath).toBe(seededState.gamePath);
    expect(s.crosshairsEnabled).toBe(true);
    expect(s.proxyConfig).toEqual(seededState.proxyConfig);
    // profiles falls back to whatever the merge produces; either the corrupt
    // value (if shallow) or default. Either way, the rest of state survives,
    // which is the bug we are fixing.
  });

  it("v18->v19 step adds heroParserIntervalSeconds without touching other fields", async () => {
    seedFromVersion(18, seededState);
    const { usePersistedStore } = await importStoreFreshly();
    await usePersistedStore.persist.rehydrate();

    const s = usePersistedStore.getState() as unknown as Record<
      string,
      unknown
    >;
    expect(s.heroParserIntervalSeconds).toBe(30);
    expect(s.proxyConfig).toEqual(seededState.proxyConfig);
  });
});
