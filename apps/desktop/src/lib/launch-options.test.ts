import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CustomSettingType } from "@deadlock-mods/shared";
import * as tauriCore from "@tauri-apps/api/core";
import { type LocalMod, ModStatus } from "@/types/mods";
import type { LocalSetting } from "@/types/settings";

let serverSettings: Promise<{ id: string }[]>;

mock.module("@/lib/client", () => ({
  queryClient: { fetchQuery: () => serverSettings },
}));
mock.module("@/lib/api-client", () => ({
  getCustomSettings: () => [],
  getMod: async () => null,
}));
mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: async () => null,
}));
// The store loads plugin discovery, which relies on Vite's import.meta.glob.
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));
const { usePersistedStore } = await import("@/lib/store");
const { getAdditionalArgs } = await import("./launch-options");
const { LIVE_BRIDGE_LINK, ModCategory } = await import("@/lib/constants");

const ADDED_AT = new Date(0);
const liveBridge = (): LocalMod => ({
  id: "local-bridge",
  remoteId: "local-bridge",
  name: "Live Scoreboard Bridge",
  description: "",
  remoteUrl: LIVE_BRIDGE_LINK,
  author: "Okaza",
  modAuthorId: null,
  downloadable: false,
  remoteAddedAt: ADDED_AT,
  remoteUpdatedAt: ADDED_AT,
  tags: [],
  images: [],
  hero: null,
  isAudio: false,
  isMap: false,
  audioUrl: null,
  isNSFW: false,
  createdAt: ADDED_AT,
  updatedAt: ADDED_AT,
  downloadCount: 0,
  likes: 0,
  isBlacklisted: false,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  isObsolete: false,
  category: ModCategory.HUD,
  filesUpdatedAt: null,
  metadata: null,
  overrides: null,
  dependencies: null,
  status: ModStatus.Downloaded,
});

const launchOption = (id: string, key: string): LocalSetting => ({
  id,
  key,
  value: "true",
  type: CustomSettingType.LAUNCH_OPTION,
  description: null,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("getAdditionalArgs", () => {
  beforeEach(() => {
    usePersistedStore.setState({
      gamePresenceEnabled: false,
      localMods: [],
      settings: {
        custom_setting_old: launchOption("custom_setting_old", "+old_option"),
        custom_setting_new: launchOption("custom_setting_new", "+new_option"),
        local_setting_abc: launchOption("local_setting_abc", "+user_option"),
      },
    });
  });

  it("drops server launch options the server no longer returns", async () => {
    serverSettings = Promise.resolve([{ id: "custom_setting_new" }]);

    expect(await getAdditionalArgs()).toBe(
      "+new_option true +user_option true",
    );
    expect(
      usePersistedStore.getState().settings.custom_setting_old,
    ).toBeUndefined();
  });

  it("keeps stored launch options when the server can't be reached", async () => {
    serverSettings = Promise.reject(new Error("offline"));

    expect(await getAdditionalArgs()).toBe(
      "+old_option true +new_option true +user_option true",
    );
  });

  it("writes the console log while the live bridge is installed", async () => {
    serverSettings = Promise.resolve([]);
    usePersistedStore.setState({
      settings: {},
      localMods: [liveBridge()],
    });

    expect(await getAdditionalArgs()).toBe("-condebug");
  });

  it("leaves logging disabled when game presence is off", async () => {
    serverSettings = Promise.resolve([]);
    usePersistedStore.setState({ gamePresenceEnabled: true, settings: {} });
    usePersistedStore.getState().setGamePresenceEnabled(false);

    expect(await getAdditionalArgs()).toBe("");
    expect(usePersistedStore.getState().gamePresenceEnabled).toBe(false);
  });

  it("keeps disabled launch options out of the arguments", async () => {
    serverSettings = Promise.resolve([]);
    usePersistedStore.setState({
      settings: {
        local_setting_logging: {
          ...launchOption("local_setting_logging", "-condebug"),
          enabled: false,
        },
      },
    });

    expect(await getAdditionalArgs()).toBe("");
  });

  it("includes logging when game presence is enabled", async () => {
    serverSettings = Promise.resolve([]);
    usePersistedStore.setState({ gamePresenceEnabled: true, settings: {} });

    expect(await getAdditionalArgs()).toBe("-condebug");
  });

  it("keeps enabled launch options when another is disabled", async () => {
    serverSettings = Promise.resolve([]);
    usePersistedStore.setState({
      settings: {
        local_setting_logging: {
          ...launchOption("local_setting_logging", "-condebug"),
          enabled: false,
        },
        local_setting_abc: launchOption("local_setting_abc", "+user_option"),
      },
    });
    expect(await getAdditionalArgs()).toBe("+user_option true");
  });
});
