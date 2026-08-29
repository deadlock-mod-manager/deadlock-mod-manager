import { beforeEach, describe, expect, it, mock } from "bun:test";
import { create } from "zustand";

const noop = () => {};
const loggerMock: Record<string, unknown> = {
  withMetadata: () => loggerMock,
  withError: () => loggerMock,
  warn: noop,
  error: noop,
  info: noop,
};

mock.module("@/lib/logger", () => ({
  createLogger: () => loggerMock,
  default: loggerMock,
}));

import type { LocalMod } from "@/types/mods";
import { ModStatus } from "@/types/mods";
import type { ModProfile, ProfileId } from "@/types/profiles";
import { createProfileId } from "@/types/profiles";
import { createModsSlice, type ModsState } from "./mods";

type TestState = ModsState & {
  profiles: Record<string, ModProfile>;
  activeProfileId: ProfileId;
};

const modFor = (remoteId: string): LocalMod =>
  ({
    id: `mod_${remoteId}`,
    remoteId,
    name: `Mod ${remoteId}`,
    status: ModStatus.Installed,
    installedVpks: [`pak0${remoteId}_dir.vpk`],
  }) as LocalMod;

const profileFor = (id: string, remoteIds: string[]): ModProfile => ({
  id: createProfileId(id),
  name: id,
  createdAt: new Date(),
  enabledMods: Object.fromEntries(
    remoteIds.map((remoteId) => [
      remoteId,
      { remoteId, enabled: true, lastModified: new Date() },
    ]),
  ),
  isDefault: id === "default",
  folderName: id === "default" ? null : `profile_1_${id}`,
  mods: remoteIds.map(modFor),
});

const createTestStore = () =>
  create<TestState>()((set, get, store) => ({
    ...createModsSlice(
      set as Parameters<typeof createModsSlice>[0],
      get as Parameters<typeof createModsSlice>[1],
      store as Parameters<typeof createModsSlice>[2],
    ),
    profiles: {},
    activeProfileId: createProfileId("default"),
  }));

let store: ReturnType<typeof createTestStore>;

beforeEach(() => {
  store = createTestStore();
  store.setState({
    localMods: [modFor("1"), modFor("2")],
    modProgress: { "1": { percentage: 100 } },
    profiles: {
      default: profileFor("default", ["1", "2"]),
      secondary: profileFor("secondary", ["1"]),
    },
    activeProfileId: createProfileId("default"),
  });
});

describe("removeMod", () => {
  it("clears the mod from the active profile's enabled mods", () => {
    store.getState().removeMod("1");

    const active = store.getState().profiles.default;
    expect(active.enabledMods["1"]).toBeUndefined();
    expect(Object.keys(active.enabledMods)).toEqual(["2"]);
    expect(active.mods.map((mod) => mod.remoteId)).toEqual(["2"]);
    expect(store.getState().localMods.map((mod) => mod.remoteId)).toEqual([
      "2",
    ]);
    expect(store.getState().modProgress["1"]).toBeUndefined();
  });

  it("leaves other profiles alone, since their copy is still installed", () => {
    store.getState().removeMod("1");

    const secondary = store.getState().profiles.secondary;
    expect(secondary.enabledMods["1"]?.enabled).toBe(true);
    expect(secondary.mods.map((mod) => mod.remoteId)).toEqual(["1"]);
  });

  it("is a no-op on profiles that never had the mod enabled", () => {
    store.setState({
      profiles: {
        default: profileFor("default", ["2"]),
      },
    });

    store.getState().removeMod("1");

    expect(Object.keys(store.getState().profiles.default.enabledMods)).toEqual([
      "2",
    ]);
  });
});

describe("clearMods", () => {
  it("empties the active profile's snapshot along with the library", () => {
    store.getState().clearMods();

    const active = store.getState().profiles.default;
    expect(store.getState().localMods).toEqual([]);
    expect(store.getState().modProgress).toEqual({});
    expect(active.mods).toEqual([]);
    expect(active.enabledMods).toEqual({});
  });

  it("leaves other profiles alone, since their copy is still installed", () => {
    store.getState().clearMods();

    const secondary = store.getState().profiles.secondary;
    expect(secondary.mods.map((mod) => mod.remoteId)).toEqual(["1"]);
    expect(secondary.enabledMods["1"]?.enabled).toBe(true);
  });

  it("still clears the library when there is no active profile", () => {
    store.setState({ profiles: {} });

    store.getState().clearMods();

    expect(store.getState().localMods).toEqual([]);
    expect(store.getState().profiles).toEqual({});
  });
});
