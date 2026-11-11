import { afterEach, describe, expect, it, mock } from "bun:test";
import type { UseMutationOptions } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import type { ModDto } from "@deadlock-mods/shared";
import type { AnalyzeAddonsResult, LocalAddonInfo } from "@/types/mods";
import { createProfileId, type ProfileId } from "@/types/profiles";

type Variables = { profileFolder: string | null; profileId?: ProfileId };
type Options = UseMutationOptions<AnalyzeAddonsResult | null, Error, Variables>;

const captured: Options[] = [];
const catalogLookups: string[] = [];
const calls: string[] = [];
const catalog = new Map<string, ModDto>();
/** Each catalog request's start and settle, and each registration, in order. */
const requests: string[] = [];
const nextTask = () => new Promise((done) => setTimeout(done, 0));
type Registration = {
  modId: string;
  installedVpks: string[];
  installedPaths: string[];
};
const registrations: Registration[] = [];
const reactQuery = await import("@tanstack/react-query");
mock.module("@tanstack/react-query", () => ({
  ...reactQuery,
  useMutation: (options: Options) => {
    captured.push(options);
    return { mutate: () => {}, isPending: false };
  },
  useQueryClient: () => ({}),
}));
mock.module("@/lib/analytics", () => ({ analytics: {} }));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
mock.module("@/contexts/analytics-context", () => ({
  useAnalyticsContext: () => ({
    analytics: { trackAddonAnalysisCompleted: () => {} },
  }),
}));
mock.module("@/lib/mods/mod-health-queries", () => ({
  invalidateModHealth: async () => {},
}));
const apiClient = await import("@/lib/api-client");
mock.module("@/lib/api-client", () => ({
  ...apiClient,
  getMod: async (remoteId: string) => {
    catalogLookups.push(remoteId);
    requests.push(`details ${remoteId}`);
    await nextTask();
    requests.push(`details ${remoteId} settled`);
    const mod = catalog.get(remoteId);
    if (!mod) throw new Error("catalog unavailable");
    return mod;
  },
  getModDownloads: async (remoteId: string) => {
    requests.push(`downloads ${remoteId}`);
    await nextTask();
    requests.push(`downloads ${remoteId} settled`);
    return { downloads: [], count: 0 };
  },
}));
const tauriCore = await import("@tauri-apps/api/core");
mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: async (command: string, args: Registration) => {
    if (command !== "register_analyzed_mod")
      throw new Error(`unexpected ${command}`);
    registrations.push(args);
    requests.push(`register ${args.modId}`);
    return { replacedModIds: [], installOrder: null };
  },
}));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: {
    success: () => {},
    error: () => {},
    warning: () => {},
  },
}));

const tauriCommands = await import("@/lib/tauri-commands");
mock.module("@/lib/tauri-commands", () => ({
  ...tauriCommands,
  analyzeLocalAddons: async (): Promise<AnalyzeAddonsResult> => {
    calls.push("scan");
    return { addons: [], totalCount: 0, errors: [] };
  },
}));

const { useAddonAnalysis } = await import("./use-addon-analysis");
const { usePersistedStore } = await import("@/lib/store");

const PROFILE = createProfileId("profile_1_reset");
const entry = {
  enabled: true,
  shard: 1,
  currentVpks: ["pak01_dir.vpk"],
  disabledVpks: [],
  originalVpkNames: ["common.vpk"],
};
const restoredMod = placeholderModFromManifest("42", entry, ["pak01_dir.vpk"]);

const recordedAddon = (): LocalAddonInfo => ({
  filePath: "/game/citadel/addons/reset/pak01_dir.vpk",
  fileName: "pak01_dir.vpk",
  locator: "pak01_dir.vpk",
  remoteId: "42",
  manifestModId: "42",
  vpkParsed: {
    version: 2,
    treeLength: 0,
    fileDataSectionSize: null,
    archiveMd5SectionSize: null,
    otherMd5SectionSize: null,
    signatureSectionSize: null,
    entries: [],
    manifestSha256: "",
    dirSha256: null,
    fingerprint: {
      filePath: "/game/citadel/addons/reset/pak01_dir.vpk",
      fileSize: 1,
      lastModified: null,
      fastHash: "",
      sha256: "",
      contentSignature: "",
      vpkVersion: 2,
      fileCount: 1,
      hasMultiparts: false,
      hasInlineData: false,
      merkleRoot: null,
      merkleLeaves: null,
    },
  },
});

/** A reset profile; `restored` puts the recorded mod back in its library. */
const resetProfile = (restored: boolean) => {
  let passes = 0;
  const mods = restored ? [restoredMod] : [];
  usePersistedStore.setState({
    activeProfileId: PROFILE,
    localMods: mods,
    analysisResult: null,
    profiles: {
      [PROFILE]: {
        id: PROFILE,
        name: "Reset",
        description: "",
        folderName: "reset",
        isDefault: false,
        createdAt: new Date(0),
        lastUsed: new Date(0),
        mods,
        enabledMods: {},
      },
    },
    restoreModsFromManifest: async () => {
      passes++;
      return [];
    },
  });
  return () => passes;
};

const renderOptions = async () => {
  captured.length = 0;
  const Probe = () => {
    useAddonAnalysis();
    return null;
  };
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <Probe />
    </I18nextProvider>,
  );
  return captured[0];
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const mutationContext = () => ({
  client: new reactQuery.QueryClient(),
  meta: undefined,
});

const analyze = async (addons: LocalAddonInfo[] = [recordedAddon()]) => {
  const options = await renderOptions();
  expect(options?.onSuccess).toBeDefined();
  const data: AnalyzeAddonsResult = {
    addons,
    totalCount: addons.length,
    errors: [],
  };
  const variables = { profileFolder: "reset", profileId: PROFILE };
  await options?.onSuccess?.(data, variables, undefined, mutationContext());
  return () =>
    options?.onSettled?.(data, null, variables, undefined, mutationContext());
};

afterEach(() => {
  catalogLookups.length = 0;
  calls.length = 0;
  catalog.clear();
  registrations.length = 0;
  requests.length = 0;
  usePersistedStore.setState({ localMods: [], profiles: {} });
});

describe("re-scanning mods the profile manifest records", () => {
  it("skips registering a recorded mod the reconciliation restored", async () => {
    const passes = resetProfile(true);
    await analyze();
    expect(passes()).toBe(0);
    expect(catalogLookups).toEqual([]);
    expect(usePersistedStore.getState().analysisResult?.errors).toEqual([]);
  });

  it("reports a recorded mod whose restore was discarded instead of skipping it", async () => {
    const passes = resetProfile(false);
    await analyze();
    expect(passes()).toBe(0);
    expect(catalogLookups).toEqual([]);
    expect(usePersistedStore.getState().analysisResult?.errors).toEqual([
      "Could not register 42: DMM's records list this mod, but restoring it was interrupted. Run Analyze Local Addons again.",
    ]);
    expect(usePersistedStore.getState().analysisDialogOpen).toBe(true);
  });
});

describe("restoring recorded mods before the scan", () => {
  it("finishes reconciling the manifest before analyzing local addons", async () => {
    resetProfile(false);
    const restore = deferred();
    usePersistedStore.setState({
      restoreModsFromManifest: async () => {
        calls.push("restore");
        await restore.promise;
        calls.push("restored");
        return [];
      },
    });
    const mutationFn = (await renderOptions())?.mutationFn;
    if (!mutationFn) throw new Error("useAddonAnalysis registered no mutation");

    const result = mutationFn(
      { profileFolder: "reset", profileId: PROFILE },
      mutationContext(),
    );
    await Promise.resolve();
    expect(calls).toEqual(["restore"]);
    restore.resolve();
    expect(await result).toEqual({ addons: [], totalCount: 0, errors: [] });
    expect(calls).toEqual(["restore", "restored", "scan"]);
  });

  it("drops the scan when the active profile changes while restoring", async () => {
    resetProfile(false);
    const other = createProfileId("profile_2_other");
    const restore = deferred();
    usePersistedStore.setState((state) => ({
      profiles: {
        ...state.profiles,
        [other]: {
          ...state.profiles[PROFILE],
          id: other,
          name: "Other",
          folderName: "other",
        },
      },
      restoreModsFromManifest: async () => {
        calls.push("restore");
        await restore.promise;
        calls.push("restored");
        return [];
      },
    }));
    const mutationFn = (await renderOptions())?.mutationFn;
    if (!mutationFn) throw new Error("useAddonAnalysis registered no mutation");

    const result = mutationFn(
      { profileFolder: "reset", profileId: PROFILE },
      mutationContext(),
    );
    await Promise.resolve();
    usePersistedStore.setState({ activeProfileId: other });
    restore.resolve();
    expect(await result).toBeNull();
    expect(calls).toEqual(["restore", "restored"]);
  });
});

/** `900001_green.vpk`: a parked file only its name identifies. */
const parkedAddon = (): LocalAddonInfo => {
  const addon = recordedAddon();
  const filePath = "/game/citadel/addons/reset/900001_green.vpk";
  return {
    ...addon,
    filePath,
    fileName: "900001_green.vpk",
    locator: "900001_green.vpk",
    remoteId: "900001",
    manifestModId: undefined,
    vpkParsed: {
      ...addon.vpkParsed,
      fingerprint: { ...addon.vpkParsed.fingerprint, filePath },
    },
  };
};

const hashMatchedAddon = (): LocalAddonInfo => ({
  ...recordedAddon(),
  filePath: "/game/citadel/addons/reset/pak05_dir.vpk",
  fileName: "pak05_dir.vpk",
  locator: "pak05_dir.vpk",
  remoteId: "900001",
  manifestModId: undefined,
  matchInfo: { certainty: 100, matchType: "sha256", modName: "E2E mod" },
});

describe("parked files whose mod left the library", () => {
  it("asks about the file instead of putting the mod back", async () => {
    resetProfile(false);
    const settle = await analyze([parkedAddon()]);
    const state = usePersistedStore.getState();
    expect(catalogLookups).toEqual([]);
    expect(state.localMods).toEqual([]);
    expect(state.analysisDialogOpen).toBe(true);
    expect(state.analysisTarget).toEqual({
      profileFolder: "reset",
      registering: true,
    });
    await settle();
    expect(usePersistedStore.getState().analysisTarget).toEqual({
      profileFolder: "reset",
      registering: false,
    });
  });

  it("keeps treating the file as its mod's while the mod is in the library", async () => {
    resetProfile(false);
    const installed = { ...restoredMod, remoteId: "900001" };
    usePersistedStore.setState((state) => ({
      localMods: [installed],
      profiles: {
        [PROFILE]: { ...state.profiles[PROFILE], mods: [installed] },
      },
    }));
    catalog.set("900001", installed);
    await analyze([parkedAddon()]);
    expect(catalogLookups).toEqual([]);
    expect(usePersistedStore.getState().localMods).toEqual([installed]);
    expect(usePersistedStore.getState().analysisDialogOpen).toBe(false);
  });

  it("registers a hash match of the same mod without the parked file", async () => {
    resetProfile(false);
    catalog.set("900001", { ...restoredMod, remoteId: "900001" });
    await analyze([parkedAddon(), hashMatchedAddon()]);
    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.installedVpks).toEqual(["pak05_dir.vpk"]);
    expect(registrations[0]?.installedPaths).toEqual([
      "/game/citadel/addons/reset/pak05_dir.vpk",
    ]);
  });
});

/** A hash match that names the archive it came from, so registration reads the mod's files. */
const archiveMatch = (remoteId: string, fileName: string): LocalAddonInfo => {
  const addon = hashMatchedAddon();
  return {
    ...addon,
    filePath: `/game/citadel/addons/reset/${fileName}`,
    fileName,
    locator: fileName,
    remoteId,
    matchInfo: {
      certainty: 100,
      matchType: "sha256",
      modName: `Mod ${remoteId}`,
      fileId: "7",
    },
  };
};

describe("registering identified mods", () => {
  it("fetches each mod's files alongside its details, one mod at a time", async () => {
    resetProfile(false);
    catalog.set("900002", { ...restoredMod, remoteId: "900002" });
    await analyze([
      archiveMatch("900001", "pak05_dir.vpk"),
      archiveMatch("900002", "pak06_dir.vpk"),
    ]);
    expect(requests).toEqual([
      "details 900001",
      "downloads 900001",
      "details 900001 settled",
      "downloads 900001 settled",
      "details 900002",
      "downloads 900002",
      "details 900002 settled",
      "downloads 900002 settled",
      "register 900002",
    ]);
    expect(usePersistedStore.getState().analysisResult?.errors).toEqual([
      "Could not register Mod 900001: catalog unavailable",
    ]);
  });
});
