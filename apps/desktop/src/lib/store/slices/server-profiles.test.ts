import { beforeEach, describe, expect, it, mock } from "bun:test";
import { create } from "zustand";

const invokeCalls: { name: string; args: unknown }[] = [];

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args: unknown) => {
    invokeCalls.push({ name, args });
  },
}));

mock.module("@/lib/logger", () => ({
  default: {
    withMetadata: () => ({
      withError: () => ({
        warn: () => {},
      }),
    }),
  },
}));

import {
  createServerProfilesSlice,
  MAX_STAGED_SERVERS,
  type ServerProfilesState,
  type StagedServer,
} from "./server-profiles";

const createTestStore = () =>
  create<ServerProfilesState>()((set, get, store) =>
    createServerProfilesSlice(
      set as Parameters<typeof createServerProfilesSlice>[0],
      get as Parameters<typeof createServerProfilesSlice>[1],
      store as Parameters<typeof createServerProfilesSlice>[2],
    ),
  );

const stagedFor = (id: string, daysAgo: number): StagedServer => ({
  serverId: id,
  folderName: `server_${id}`,
  requiredModIds: [],
  lastUsed: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  layered: false,
});

const seed = (
  store: ReturnType<typeof createTestStore>,
  entries: StagedServer[],
  lastJoinId?: string,
) => {
  const map = Object.fromEntries(entries.map((e) => [e.serverId, e]));
  store.setState({
    stagedServers: map,
    lastServerJoin: lastJoinId
      ? { serverId: lastJoinId, folderName: `server_${lastJoinId}` }
      : null,
  });
};

describe("evictStagedServersIfNeeded", () => {
  beforeEach(() => {
    invokeCalls.length = 0;
  });

  it("does nothing when count is at or below the cap", async () => {
    const store = createTestStore();
    const entries = Array.from({ length: MAX_STAGED_SERVERS }, (_, i) =>
      stagedFor(`s${i}`, i),
    );
    seed(store, entries);

    await store.getState().evictStagedServersIfNeeded();

    expect(Object.keys(store.getState().stagedServers).length).toBe(
      MAX_STAGED_SERVERS,
    );
    expect(invokeCalls).toHaveLength(0);
  });

  it("removes the oldest entry when over the cap", async () => {
    const store = createTestStore();
    const entries = [
      stagedFor("oldest", 10),
      ...Array.from({ length: MAX_STAGED_SERVERS }, (_, i) =>
        stagedFor(`s${i}`, i),
      ),
    ];
    seed(store, entries);

    await store.getState().evictStagedServersIfNeeded();

    expect(store.getState().stagedServers.oldest).toBeUndefined();
    expect(Object.keys(store.getState().stagedServers).length).toBe(
      MAX_STAGED_SERVERS,
    );
    expect(invokeCalls).toEqual([
      { name: "delete_server_addons_folder", args: { serverId: "oldest" } },
    ]);
  });

  it("skips the protected last-joined entry and evicts the next oldest", async () => {
    const store = createTestStore();
    const entries = [
      stagedFor("last_joined_but_old", 10),
      stagedFor("next_oldest", 9),
      ...Array.from({ length: MAX_STAGED_SERVERS - 1 }, (_, i) =>
        stagedFor(`s${i}`, i),
      ),
    ];
    seed(store, entries, "last_joined_but_old");

    await store.getState().evictStagedServersIfNeeded();

    const remaining = store.getState().stagedServers;
    expect(remaining.last_joined_but_old).toBeDefined();
    expect(remaining.next_oldest).toBeUndefined();
    expect(Object.keys(remaining).length).toBe(MAX_STAGED_SERVERS);
    expect(invokeCalls).toEqual([
      {
        name: "delete_server_addons_folder",
        args: { serverId: "next_oldest" },
      },
    ]);
  });

  it("evicts multiple entries at once when several over the cap", async () => {
    const store = createTestStore();
    const entries = [
      stagedFor("a", 100),
      stagedFor("b", 90),
      stagedFor("c", 80),
      ...Array.from({ length: MAX_STAGED_SERVERS }, (_, i) =>
        stagedFor(`s${i}`, i),
      ),
    ];
    seed(store, entries);

    await store.getState().evictStagedServersIfNeeded();

    const remaining = store.getState().stagedServers;
    expect(remaining.a).toBeUndefined();
    expect(remaining.b).toBeUndefined();
    expect(remaining.c).toBeUndefined();
    expect(Object.keys(remaining).length).toBe(MAX_STAGED_SERVERS);
    expect(invokeCalls.map((c) => c.args)).toEqual([
      { serverId: "a" },
      { serverId: "b" },
      { serverId: "c" },
    ]);
  });

  it("never evicts the protected entry, even if multiple removals are needed", async () => {
    const store = createTestStore();
    const entries = [
      stagedFor("protected_oldest", 100),
      stagedFor("a", 90),
      stagedFor("b", 80),
      ...Array.from({ length: MAX_STAGED_SERVERS }, (_, i) =>
        stagedFor(`s${i}`, i),
      ),
    ];
    seed(store, entries, "protected_oldest");

    await store.getState().evictStagedServersIfNeeded();

    const remaining = store.getState().stagedServers;
    expect(remaining.protected_oldest).toBeDefined();
    expect(remaining.a).toBeUndefined();
    expect(remaining.b).toBeUndefined();
    expect(Object.keys(remaining).length).toBe(MAX_STAGED_SERVERS);
  });
});
