import { expect, mock, test } from "bun:test";
import type { RuntimeBootstrap } from "./runtime-bootstrap";
import {
  initializeRuntimeBootstrap,
  isPluginsBuilt,
} from "./runtime-bootstrap";
import { setPluginRuntimeEnabled } from "./external-plugins";

const bootstrap: RuntimeBootstrap = {
  mode: "production",
  stateStorePath: "state.json",
  appDataPath: null,
  endpoints: [],
  integrations: null,
  stateFileRecovery: null,
  features: { matchSync: true, plugins: false },
};
const calls: string[] = [];

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    calls.push(command);
    if (command === "get_runtime_bootstrap") return bootstrap;
  },
  convertFileSrc: (path: string) => path,
}));

test("plugin IPC stays unavailable until bootstrap reports build support", async () => {
  expect(isPluginsBuilt()).toBe(false);
  await setPluginRuntimeEnabled(true);
  expect(calls).toEqual([]);

  await initializeRuntimeBootstrap();
  expect(isPluginsBuilt()).toBe(false);
  calls.length = 0;
  await setPluginRuntimeEnabled(true);
  await setPluginRuntimeEnabled(false);
  expect(calls).toEqual([]);

  bootstrap.features.plugins = true;
  expect(isPluginsBuilt()).toBe(true);
  await setPluginRuntimeEnabled(true);
  await setPluginRuntimeEnabled(false);
  expect(calls).toEqual([
    "external_plugins_set_enabled",
    "external_plugins_set_enabled",
  ]);
});
