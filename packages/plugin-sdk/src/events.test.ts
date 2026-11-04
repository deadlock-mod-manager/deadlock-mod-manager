import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  mock,
} from "bun:test";
import {
  createPluginClient,
  PluginCallError,
  type BridgeRequest,
} from "./index";
import {
  createEventClient,
  type EventBatch,
  type EventSnapshot,
  type HostEvent,
} from "./events";

const installed: HostEvent = {
  id: "host:1",
  schemaVersion: 1,
  observedAt: "2026-10-31T12:00:00Z",
  operationId: "mod:1",
  type: "mods.install.completed",
  data: { modId: "skin", profile: "default" },
};
const snapshot: EventSnapshot = { latest: [installed], cursor: "head" };

describe("event bridge", () => {
  it("uses host-owned methods with typed results", async () => {
    const requests: BridgeRequest[] = [];
    const client = createPluginClient({
      transport: async (request) => {
        requests.push(request);
        return JSON.stringify({
          ok: true,
          value: request.command.endsWith("snapshot")
            ? snapshot
            : { events: [installed], cursor: "next", hasMore: false },
        });
      },
    });
    expect(await client.events.snapshot(["mods.install.completed"])).toEqual(
      snapshot,
    );
    const batch = await client.events.read({
      types: ["mods.install.completed"],
      after: "head",
      limit: 1,
    });
    const event = batch.events[0];
    if (event?.type !== "mods.install.completed")
      throw new TypeError("Expected an install event");
    expect(event.data.modId).toBe("skin");
    expect(requests).toEqual([
      {
        command: "host.events.snapshot",
        payloadJson: '{"types":["mods.install.completed"]}',
      },
      {
        command: "host.events.read",
        payloadJson:
          '{"types":["mods.install.completed"],"after":"head","limit":1}',
      },
    ]);
  });

  it.each([
    { ...installed, schemaVersion: 2 },
    { ...installed, data: { modId: 123, profile: "default" } },
    { ...installed, type: "future.event" },
  ])("rejects invalid event data at the bridge boundary", async (event) => {
    const client = createPluginClient({
      transport: async () =>
        JSON.stringify({
          ok: true,
          value: { latest: [event], cursor: "head" },
        }),
    });
    await expect(
      client.events.snapshot(["mods.install.completed"]),
    ).rejects.toMatchObject({ source: "protocol", code: "invalid_value" });
  });
});

describe("event subscriptions", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("separates initial observations from new events and stops inside a callback", async () => {
    const read = mock(
      async (): Promise<EventBatch> => ({
        events: [installed],
        cursor: "next",
        hasMore: false,
      }),
    );
    const onSnapshot = mock<(value: EventSnapshot) => void>();
    const onError = mock<(error: Error) => void>();
    const seen: HostEvent[] = [];
    const client = createEventClient({ snapshot: async () => snapshot, read });
    const unsubscribe = await client.subscribe(
      { types: ["mods.install.completed"], onSnapshot, onError },
      (event) => {
        seen.push(event);
        unsubscribe();
      },
    );
    expect(seen).toEqual([]);
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    jest.advanceTimersByTime(0);
    await Promise.resolve();
    jest.advanceTimersByTime(2000);
    expect(seen).toEqual([installed]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not deliver an in-flight read after unsubscribe", async () => {
    let resolveRead: ((batch: EventBatch) => void) | undefined;
    const onEvent = mock<(event: HostEvent) => void>();
    const client = createEventClient({
      snapshot: async () => snapshot,
      read: () =>
        new Promise<EventBatch>((resolve) => {
          resolveRead = resolve;
        }),
    });
    const unsubscribe = await client.subscribe(
      {
        types: ["mods.install.completed"],
        onSnapshot: () => {},
        onError: () => {},
      },
      onEvent,
    );
    jest.advanceTimersByTime(0);
    unsubscribe();
    resolveRead?.({ events: [installed], cursor: "next", hasMore: false });
    await Promise.resolve();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("recovers an expired cursor through a fresh snapshot", async () => {
    const snapshots = mock(async () => ({ latest: [], cursor: "fresh" }));
    const read = mock(async (): Promise<EventBatch> => {
      throw new PluginCallError({
        source: "command",
        command: "host.events.read",
        code: "cursor_expired",
        message: "Expired",
      });
    });
    const onSnapshot = mock<(value: EventSnapshot) => void>();
    const onError = mock<(error: Error) => void>();
    const client = createEventClient({ snapshot: snapshots, read });
    const unsubscribe = await client.subscribe(
      { types: ["game.started"], onSnapshot, onError },
      () => {},
    );
    jest.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots).toHaveBeenCalledTimes(2);
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("refreshes asynchronously initialized state without treating it as a new event", async () => {
    let current: EventSnapshot = { latest: [], cursor: "initial" };
    const read = mock(
      async (): Promise<EventBatch> => ({
        events: [],
        cursor: "read-cursor",
        hasMore: false,
      }),
    );
    const onSnapshot = mock<(value: EventSnapshot) => void>();
    const onEvent = mock<(event: HostEvent) => void>();
    const client = createEventClient({ snapshot: async () => current, read });
    const unsubscribe = await client.subscribe(
      { types: ["mods.install.completed"], onSnapshot, onError: () => {} },
      onEvent,
    );
    current = snapshot;
    jest.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(onSnapshot).toHaveBeenLastCalledWith(snapshot);
    expect(onEvent).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    expect(read).toHaveBeenLastCalledWith({
      types: ["mods.install.completed"],
      after: "read-cursor",
    });
    unsubscribe();
  });

  it("stops on revoked access instead of retrying indefinitely", async () => {
    const denied = new PluginCallError({
      source: "bridge",
      command: "host.events.read",
      code: "disabled",
      message: "Disabled",
    });
    const read = mock(async (): Promise<EventBatch> => {
      throw denied;
    });
    const onError = mock<(error: Error) => void>();
    const client = createEventClient({ snapshot: async () => snapshot, read });
    await client.subscribe(
      { types: ["game.started"], onSnapshot: () => {}, onError },
      () => {},
    );
    jest.advanceTimersByTime(0);
    await Promise.resolve();
    jest.advanceTimersByTime(5000);
    expect(onError).toHaveBeenCalledWith(denied);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
