import { afterEach, describe, expect, it, mock } from "bun:test";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import type {
  ReinstallOptions,
  ReinstallResult,
} from "@/hooks/use-reinstall-mod";
import en from "@/locales/en.json";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import { type LocalMod, ModStatus } from "@/types/mods";

const reinstallMod =
  mock<
    (mod: LocalMod, options: ReinstallOptions) => Promise<ReinstallResult>
  >();

mock.module("@/lib/analytics", () => ({ analytics: {} }));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { success: () => {}, error: () => {}, info: () => {} },
}));
mock.module("@/components/providers/alert-dialog", () => ({
  useConfirm: () => async () => true,
}));
mock.module("@/hooks/use-reinstall-mod", () => ({
  useReinstallMod: () => ({ reinstallMod }),
}));
const isQueued = mock((_modId: string) => false);
const actualDownloads = await import("@/lib/download/manager");
mock.module("@/lib/download/manager", () => ({
  ...actualDownloads,
  downloadManager: { isQueued },
}));

const { useReinstallAction } = await import("./use-reinstall-action");
const { usePersistedStore } = await import("@/lib/store");

// A download status left behind by a download that never reported back.
const stale: LocalMod = {
  ...placeholderModFromManifest(
    "42",
    {
      enabled: true,
      shard: 0,
      currentVpks: ["pak01_dir.vpk"],
      disabledVpks: [],
      originalVpkNames: ["pak01_dir.vpk"],
    },
    ["pak01_dir.vpk"],
  ),
  status: ModStatus.Downloading,
};

const seedMods = (mods: LocalMod[]) => {
  const { activeProfileId, profiles } = usePersistedStore.getState();
  const profile = profiles[activeProfileId];
  if (!profile) throw new Error("No active profile");
  usePersistedStore.setState({
    localMods: mods,
    profiles: { ...profiles, [activeProfileId]: { ...profile, mods } },
  });
};

const renderReinstall = async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const actions: ReturnType<typeof useReinstallAction>[] = [];
  const Probe = () => {
    actions.push(useReinstallAction(stale));
    return null;
  };
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <Probe />
    </I18nextProvider>,
  );
  const action = actions[0];
  if (!action) throw new Error("useReinstallAction did not render");
  return action.reinstall;
};

const storedStatus = () =>
  usePersistedStore
    .getState()
    .localMods.find((entry) => entry.remoteId === stale.remoteId)?.status;

afterEach(() => {
  reinstallMod.mockReset();
  isQueued.mockReset();
  isQueued.mockImplementation(() => false);
  seedMods([]);
});

describe("reinstalling a mod with a stale download status", () => {
  it("keeps the status when the old files could not be removed", async () => {
    seedMods([stale]);
    reinstallMod.mockImplementation(() =>
      Promise.reject({ kind: "readOnlyFile", message: "File is read-only" }),
    );

    const reinstall = await renderReinstall();
    await reinstall();

    expect(storedStatus()).toBe(ModStatus.Downloading);
  });

  it("clears the stale status before downloading again", async () => {
    seedMods([stale]);
    const seen: (ModStatus | undefined)[] = [];
    reinstallMod.mockImplementation(async (_mod, options) => {
      options.onStep?.("purging");
      seen.push(storedStatus());
      options.onStep?.("downloading");
      seen.push(storedStatus());
      return { outcome: "downloadedOnly" };
    });

    const reinstall = await renderReinstall();
    await reinstall();

    expect(seen).toEqual([ModStatus.Downloading, ModStatus.FailedToDownload]);
  });

  it("leaves a download queued during the purge alone", async () => {
    seedMods([stale]);
    reinstallMod.mockImplementation(async (_mod, options) => {
      options.onStep?.("purging");
      // Started elsewhere while the purge waited on a prompt.
      isQueued.mockImplementation(() => true);
      options.onStep?.("downloading");
      return { outcome: "failed" };
    });

    const reinstall = await renderReinstall();
    await reinstall();

    expect(storedStatus()).toBe(ModStatus.Downloading);
  });
});
