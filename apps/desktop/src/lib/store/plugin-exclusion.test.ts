import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/plugins", () => ({
  getPlugins: () => [
    {
      manifest: {
        id: "themes",
        disabledPlugins: ["background"],
        alwaysEnabled: true,
      },
    },
    { manifest: { id: "background", disabledPlugins: [] } },
    { manifest: { id: "flashbang", disabledPlugins: [] } },
  ],
}));

const {
  applyPluginSettings,
  disablePlugin,
  enablePlugin,
  resolvePluginEnabled,
} = await import("./utils/plugin-slice");

const themeSettings = (activeTheme?: string) => ({
  activeSection: "pre-defined",
  activeTheme,
});

describe("plugin exclusion via manifest disabledPlugins", () => {
  it("enabling background does not disable the themes plugin", () => {
    const result = enablePlugin(
      {
        enabledPlugins: { background: false },
        pluginSettings: { themes: themeSettings("bloodmoon") },
      },
      "background",
    );

    expect(result.enabledPlugins).toEqual({ background: true });
  });

  it("enabling background clears the active theme instead", () => {
    const result = enablePlugin(
      {
        enabledPlugins: { background: false },
        pluginSettings: { themes: themeSettings("bloodmoon") },
      },
      "background",
    );

    expect(result.pluginSettings).toEqual({ themes: themeSettings(undefined) });
  });

  it("leaves theme settings untouched when nothing excludes themes", () => {
    const result = enablePlugin(
      {
        enabledPlugins: { flashbang: false },
        pluginSettings: { themes: themeSettings("bloodmoon") },
      },
      "flashbang",
    );

    expect(result.enabledPlugins).toEqual({ flashbang: true });
    expect(result.pluginSettings).toEqual({
      themes: themeSettings("bloodmoon"),
    });
  });

  it("enabling an always-enabled plugin writes no persisted flag", () => {
    const result = enablePlugin(
      { enabledPlugins: {}, pluginSettings: {} },
      "themes",
    );

    expect(result).toEqual({});
  });

  it("an always-enabled plugin cannot be disabled", () => {
    const result = disablePlugin(
      { enabledPlugins: {}, pluginSettings: {} },
      "themes",
    );

    expect(result).toEqual({});
  });

  it("disables a plugin that has its own toggle", () => {
    const result = disablePlugin(
      { enabledPlugins: { background: true }, pluginSettings: {} },
      "background",
    );

    expect(result.enabledPlugins).toEqual({ background: false });
  });

  it("resolves an always-enabled plugin as enabled without a persisted flag", () => {
    expect(resolvePluginEnabled({}, "themes")).toBe(true);
    expect(resolvePluginEnabled({}, "background")).toBe(false);
    expect(resolvePluginEnabled({ background: true }, "background")).toBe(true);
  });

  it("ignores a stale disabled flag for an always-enabled plugin", () => {
    expect(resolvePluginEnabled({ themes: false }, "themes")).toBe(true);
  });

  it("selecting a theme disables the background plugin", () => {
    const result = applyPluginSettings(
      { enabledPlugins: { background: true }, pluginSettings: {} },
      "themes",
      themeSettings("bloodmoon"),
    );

    expect(result.enabledPlugins).toEqual({ background: false });
    expect(result.pluginSettings).toEqual({
      themes: themeSettings("bloodmoon"),
    });
  });

  it("clearing the active theme leaves the background plugin alone", () => {
    const result = applyPluginSettings(
      { enabledPlugins: { background: true }, pluginSettings: {} },
      "themes",
      themeSettings(undefined),
    );

    expect(result.enabledPlugins).toBeUndefined();
    expect(result.pluginSettings).toEqual({ themes: themeSettings(undefined) });
  });

  it("treats a non-string active theme as no selection", () => {
    const result = applyPluginSettings(
      { enabledPlugins: { background: true }, pluginSettings: {} },
      "themes",
      { activeSection: "pre-defined", activeTheme: null },
    );

    expect(result.enabledPlugins).toBeUndefined();
  });

  it("settings for a plugin with its own toggle never change enablement", () => {
    const result = applyPluginSettings(
      { enabledPlugins: { background: true }, pluginSettings: {} },
      "background",
      { opacity: 50 },
    );

    expect(result.enabledPlugins).toBeUndefined();
    expect(result.pluginSettings).toEqual({ background: { opacity: 50 } });
  });
});
