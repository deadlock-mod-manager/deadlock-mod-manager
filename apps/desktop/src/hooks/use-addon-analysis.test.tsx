import { afterEach, describe, expect, it, mock } from "bun:test";
import type { UseMutationOptions } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import type { AnalyzeAddonsResult, LocalAddonInfo } from "@/types/mods";
import { createProfileId, type ProfileId } from "@/types/profiles";

type Variables = { profileFolder: string | null; profileId?: ProfileId };
type Options = UseMutationOptions<AnalyzeAddonsResult | null, Error, Variables>;

const captured: Options[] = [];
const catalogLookups: string[] = [];
const calls: string[] = [];
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
    throw new Error("catalog unavailable");
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

const analyze = async () => {
  const onSuccess = (await renderOptions())?.onSuccess;
  expect(onSuccess).toBeDefined();
  const data: AnalyzeAddonsResult = {
    addons: [recordedAddon()],
    totalCount: 1,
    errors: [],
  };
  await onSuccess?.(
    data,
    { profileFolder: "reset", profileId: PROFILE },
    undefined,
    mutationContext(),
  );
};

afterEach(() => {
  catalogLookups.length = 0;
  calls.length = 0;
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
