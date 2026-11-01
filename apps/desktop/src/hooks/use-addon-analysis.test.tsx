import { afterEach, describe, expect, it, mock } from "bun:test";
import type { UseMutationOptions } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import type { AnalyzeAddonsResult, LocalAddonInfo } from "@/types/mods";
import type { ProfileId } from "@/types/profiles";

type Variables = { profileFolder: string | null; profileId?: ProfileId };
type Options = UseMutationOptions<AnalyzeAddonsResult | null, Error, Variables>;

const captured: Options[] = [];
const catalogLookups: string[] = [];
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

const { useAddonAnalysis } = await import("./use-addon-analysis");
const { usePersistedStore } = await import("@/lib/store");

const PROFILE = "profile_1_reset" as ProfileId;
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

/** A reset profile whose library restores only on the given reconciliation pass. */
const resetProfile = (restoresOnPass: number) => {
  let passes = 0;
  usePersistedStore.setState({
    activeProfileId: PROFILE,
    localMods: [],
    profiles: {
      [PROFILE]: {
        id: PROFILE,
        name: "Reset",
        description: "",
        folderName: "reset",
        isDefault: false,
        createdAt: new Date(0),
        lastUsed: new Date(0),
        mods: [],
        enabledMods: {},
      },
    },
    restoreModsFromManifest: async () => {
      passes++;
      if (passes === restoresOnPass)
        usePersistedStore.setState((state) => ({
          localMods: [restoredMod],
          profiles: {
            ...state.profiles,
            [PROFILE]: { ...state.profiles[PROFILE], mods: [restoredMod] },
          },
        }));
      return [];
    },
  });
  return () => passes;
};

const analyze = async () => {
  captured.length = 0;
  const Probe = () => {
    useAddonAnalysis();
    return null;
  };
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <Probe />
    </I18nextProvider>,
  );
  const onSuccess = captured[0]?.onSuccess;
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
  );
};

afterEach(() => {
  catalogLookups.length = 0;
  usePersistedStore.setState({ localMods: [], profiles: {} });
});

describe("re-scanning mods the profile manifest records", () => {
  it("skips registering a recorded mod the reconciliation restored", async () => {
    const passes = resetProfile(0);
    usePersistedStore.setState((state) => ({
      localMods: [restoredMod],
      profiles: {
        ...state.profiles,
        [PROFILE]: { ...state.profiles[PROFILE], mods: [restoredMod] },
      },
    }));
    await analyze();
    expect(passes()).toBe(0);
    expect(catalogLookups).toEqual([]);
  });

  it("restores again when the first reconciliation's restore was discarded", async () => {
    const passes = resetProfile(1);
    await analyze();
    expect(passes()).toBe(1);
    expect(catalogLookups).toEqual([]);
    expect(
      usePersistedStore
        .getState()
        .profiles[PROFILE]?.mods.map((mod) => mod.remoteId),
    ).toEqual(["42"]);
  });

  it("falls back to regular registration instead of a silent skip", async () => {
    const passes = resetProfile(-1);
    await analyze();
    expect(passes()).toBe(1);
    expect(catalogLookups).toEqual(["42"]);
  });
});
