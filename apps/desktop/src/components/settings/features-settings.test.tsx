import { beforeAll, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { RuntimeBootstrap } from "@/lib/runtime-bootstrap";

const bootstrap: RuntimeBootstrap = {
  mode: "production",
  stateStorePath: "state.json",
  appDataPath: null,
  endpoints: [],
  integrations: null,
  stateFileRecovery: null,
  features: { matchSync: false, plugins: false },
};
const state = {
  features: {
    stats: true,
    "server-browser": true,
    "server-picker": true,
    crosshairs: true,
    skins: true,
    autoexec: true,
    performance: true,
    foundry: true,
    plugins: true,
  },
  experimentalFeatures: {
    "custom-maps": false,
    "mod-foundry": true,
    "performance-configs": true,
    "cloud-backup": false,
    plugins: true,
  },
  minimalMode: false,
  setFeatureEnabled: () => undefined,
  setMinimalMode: () => undefined,
  markFeatureUsed: () => undefined,
};

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string) =>
    command === "get_runtime_bootstrap" ? bootstrap : undefined,
  convertFileSrc: (path: string) => path,
}));
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
mock.module("@/lib/store", () => ({
  usePersistedStore: <T,>(select: (value: typeof state) => T): T =>
    select(state),
}));
mock.module("@/hooks/use-feature-leftovers", () => ({
  useFeatureLeftovers: () => () => null,
}));
mock.module("@/lib/external-plugins", () => ({
  syncPluginRuntime: async () => undefined,
}));
mock.module("@deadlock-mods/ui/components/badge", () => ({
  Badge: () => <span />,
}));
mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: () => <button type='button' />,
}));
mock.module("@/components/settings/feature-toggle-row", () => ({
  FeatureToggleRow: ({ id }: { id: string }) => <div data-row={id} />,
}));
mock.module("@/components/settings/minimal-mode-card", () => ({
  MinimalModeCard: ({ total }: { total: number }) => <div data-total={total} />,
}));

// Loaded before the bootstrap resolves, the way main.tsx imports the settings
// page before initializeApplication().
const { FeaturesSettings } = await import("./features-settings");
const { initializeRuntimeBootstrap } = await import("@/lib/runtime-bootstrap");

const render = () =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <FeaturesSettings onOpenExperimental={() => undefined} />
    </QueryClientProvider>,
  );

describe("features settings after startup", () => {
  beforeAll(async () => {
    await initializeRuntimeBootstrap();
  });

  it("hides the plugins toggle in builds without the plugin runtime", () => {
    bootstrap.features.plugins = false;
    const html = render();
    expect(html).not.toContain('data-row="feature-plugins"');
    expect(html).toContain('data-row="feature-foundry"');
    expect(html).toContain('data-total="8"');
  });

  it("shows the plugins toggle in builds with the plugin runtime", () => {
    bootstrap.features.plugins = true;
    const html = render();
    expect(html).toContain('data-row="feature-plugins"');
    expect(html).toContain('data-total="9"');
  });
});
