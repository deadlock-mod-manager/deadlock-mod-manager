import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CustomSettingType } from "@deadlock-mods/shared";
import * as tauriCore from "@tauri-apps/api/core";
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
});
