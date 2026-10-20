import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CustomSettingType } from "@deadlock-mods/shared";
import type { LocalSetting } from "@/types/settings";

let serverSettings: Promise<{ id: string }[]>;
let settings: Record<string, LocalSetting>;

mock.module("@/lib/client", () => ({
  queryClient: { fetchQuery: () => serverSettings },
}));
mock.module("@/lib/api-client", () => ({ getCustomSettings: () => [] }));
mock.module("@tauri-apps/api/core", () => ({ invoke: async () => null }));
mock.module("@/lib/store", () => ({
  usePersistedStore: {
    getState: () => ({
      settings,
      gamePresenceEnabled: false,
      removeSetting: (id: string) => {
        settings = Object.fromEntries(
          Object.entries(settings).filter(([k]) => k !== id),
        );
      },
    }),
  },
}));

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
    settings = {
      custom_setting_old: launchOption("custom_setting_old", "+old_option"),
      custom_setting_new: launchOption("custom_setting_new", "+new_option"),
      local_setting_abc: launchOption("local_setting_abc", "+user_option"),
    };
  });

  it("drops server launch options the server no longer returns", async () => {
    serverSettings = Promise.resolve([{ id: "custom_setting_new" }]);

    expect(await getAdditionalArgs()).toBe(
      "+new_option true +user_option true",
    );
    expect(settings.custom_setting_old).toBeUndefined();
  });

  it("keeps stored launch options when the server can't be reached", async () => {
    serverSettings = Promise.reject(new Error("offline"));

    expect(await getAdditionalArgs()).toBe(
      "+old_option true +new_option true +user_option true",
    );
  });
});
