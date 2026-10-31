import { afterEach, describe, expect, it, mock } from "bun:test";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import type { ModDownloadItem } from "@/types/mods";
import en from "@/locales/en.json";

mock.module("@/lib/analytics", () => ({ analytics: {} }));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { success: () => {}, error: () => {} },
}));

const { useBatchUpdate } = await import("./use-batch-update");
const { usePersistedStore } = await import("@/lib/store");

const file = (name: string): ModDownloadItem => ({
  name,
  url: `https://gamebanana.com/dl/${name}`,
  size: 10,
  md5Checksum: null,
  createdAt: null,
  updatedAt: null,
});

afterEach(() => {
  usePersistedStore.setState({ localMods: [] });
});

describe("batch update preparation", () => {
  it("uses the latest installed variant when preparing an update after a library change", async () => {
    const callbacks: ReturnType<typeof useBatchUpdate>["prepareUpdates"][] = [];
    const Probe = () => {
      callbacks.push(useBatchUpdate().prepareUpdates);
      return null;
    };
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      resources: { en: { translation: en } },
    });
    renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <Probe />
      </I18nextProvider>,
    );
    const prepareUpdates = callbacks[0];
    expect(prepareUpdates).toBeDefined();
    if (!prepareUpdates) return;

    const red = file("red.zip");
    const blue = file("blue.zip");
    const mod = placeholderModFromManifest(
      "42",
      {
        enabled: true,
        shard: 0,
        currentVpks: ["pak01_dir.vpk"],
        disabledVpks: [],
        originalVpkNames: ["pak01_dir.vpk"],
      },
      ["pak01_dir.vpk"],
    );
    usePersistedStore.setState({
      localMods: [{ ...mod, selectedDownloads: [red] }],
    });
    const updates = [{ mod, downloads: [red, blue] }];
    expect(prepareUpdates(updates)[0]?.selectedDownloads).toEqual([red]);

    usePersistedStore.setState({
      localMods: [{ ...mod, selectedDownloads: [blue] }],
    });
    expect(prepareUpdates(updates)[0]?.selectedDownloads).toEqual([blue]);
  });
});
