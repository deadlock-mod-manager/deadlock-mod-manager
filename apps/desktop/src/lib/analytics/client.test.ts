import { describe, expect, it } from "bun:test";
import {
  createAnalyticsClient,
  failureOutcome,
  modEntryPoint,
  screenName,
  type AnalyticsContext,
  type AnalyticsProperties,
} from "./client";

const fixture = () => {
  let context: AnalyticsContext = {
    enabled: true,
    version: "2.1.0",
    os: "windows",
    releaseChannel: "stable",
    consentEpoch: 0,
  };
  let time = 1000;
  let nextId = 0;
  const events: { name: string; properties: AnalyticsProperties }[] = [];
  const client = createAnalyticsClient({
    getContext: () => context,
    send: (name, properties) => {
      events.push({ name, properties });
    },
    now: () => time,
    createId: () => `attempt-${++nextId}`,
  });
  return {
    client,
    events,
    setContext: (updates: Partial<AnalyticsContext>) => {
      context = { ...context, ...updates };
    },
    setTime: (value: number) => {
      time = value;
    },
  };
};

describe("analytics consent and readiness", () => {
  it("drops events while disabled or before version readiness instead of replaying them", () => {
    const test = fixture();
    test.setContext({ enabled: false });
    expect(test.client.capture("page_viewed")).toBe(false);
    test.setContext({ enabled: true, version: undefined });
    expect(test.client.capture("app_ready")).toBe(false);
    const attempt = test.client.start("mod_download");
    test.setContext({ version: "2.1.0" });
    expect(attempt.finish("completed")).toBe(false);
    expect(test.events).toEqual([]);
    expect(test.client.capture("app_ready")).toBe(true);
    expect(test.events.map((event) => event.name)).toEqual(["app_ready"]);
  });

  it("uses the running release metadata even if callers pass a missing or stale version", () => {
    const test = fixture();
    test.client.capture("app_ready", {
      app_version: undefined,
      release_channel: "nightly",
      os: "wrong",
      absent: undefined,
      bad_number: NaN,
      infinite: Infinity,
      count: 0,
    });
    expect(test.events[0]?.properties).toEqual({
      app_version: "2.1.0",
      release_channel: "stable",
      os: "windows",
      count: 0,
    });
  });

  it("does not allow a throwing analytics transport to break an action", () => {
    const client = createAnalyticsClient({
      getContext: () => ({
        enabled: true,
        version: "2.1.0",
        os: "linux",
        releaseChannel: "stable",
        consentEpoch: 0,
      }),
      send: () => {
        throw new Error("Network unavailable");
      },
      now: () => 0,
      createId: () => "attempt",
    });
    expect(client.capture("app_ready")).toBe(false);
    expect(client.start("mod_install").finish("completed")).toBe(false);
  });
});

describe("analytics action outcomes", () => {
  it("pairs concurrent attempts with independent IDs, source context and duration", () => {
    const test = fixture();
    const first = test.client.start("mod_download", {
      entry_point: "search",
      operation_kind: "download",
    });
    test.setTime(2000);
    const second = test.client.start("mod_install", {
      entry_point: "deep_link",
    });
    test.setTime(4000);
    second.finish("completed", { vpk_count: 2 });
    first.finish("cancelled");
    expect(
      test.events.map((event) => [
        event.name,
        event.properties.operation_id,
        event.properties.outcome,
        event.properties.duration_seconds,
      ]),
    ).toEqual([
      ["mod_download_started", "attempt-1", undefined, undefined],
      ["mod_install_started", "attempt-2", undefined, undefined],
      ["mod_install_result", "attempt-2", "completed", 2],
      ["mod_download_result", "attempt-1", "cancelled", 3],
    ]);
    expect(test.events[2]?.properties.entry_point).toBe("deep_link");
    expect(test.events[3]?.properties.entry_point).toBe("search");
  });

  it("records one terminal result even if success is followed by an error callback", () => {
    const test = fixture();
    const attempt = test.client.start("mod_install");
    expect(attempt.finish("completed")).toBe(true);
    expect(attempt.finish("failed")).toBe(false);
    expect(attempt.finish("cancelled")).toBe(false);
    expect(
      test.events.filter((event) => event.name === "mod_install_result"),
    ).toHaveLength(1);
  });

  it("suppresses results after consent is revoked", () => {
    const test = fixture();
    const attempt = test.client.start("game_launch");
    test.setContext({ enabled: false, consentEpoch: 1 });
    expect(attempt.finish("completed")).toBe(false);
    expect(test.events).toHaveLength(1);
  });

  it("does not resurrect an attempt when consent is disabled then enabled again", () => {
    const test = fixture();
    const oldAttempt = test.client.start("mod_install");
    test.setContext({ enabled: false, consentEpoch: 1 });
    test.setContext({ enabled: true, consentEpoch: 2 });
    expect(oldAttempt.finish("completed")).toBe(false);
    const newAttempt = test.client.start("mod_install");
    expect(newAttempt.finish("completed")).toBe(true);
    expect(test.events).toHaveLength(3);
  });

  it("clamps duration when the system clock goes backwards", () => {
    const test = fixture();
    const attempt = test.client.start("mod_download");
    test.setTime(0);
    attempt.finish("failed");
    expect(test.events[1]?.properties.duration_seconds).toBe(0);
  });

  it("separates blocks, cancellations and genuine operation failures", () => {
    expect(failureOutcome("gameRunning")).toBe("blocked");
    expect(failureOutcome("vpkInUse")).toBe("blocked");
    expect(failureOutcome("gamePathNotSet")).toBe("blocked");
    expect(failureOutcome("downloadCancelled")).toBe("cancelled");
    expect(failureOutcome("networkError")).toBe("failed");
    expect(failureOutcome()).toBe("failed");
  });
});

describe("bounded navigation metadata", () => {
  it("labels the actual home dashboard and normalizes dynamic routes", () => {
    expect(screenName("/")).toBe("dashboard");
    expect(screenName("/my-mods")).toBe("my-mods");
    expect(screenName("/mods/private-id")).toBe("mod-details");
    expect(screenName("/albums/private-name")).toBe("album");
    expect(screenName("/authors/private-id")).toBe("author");
    expect(screenName("/plugins/private-name")).toBe("plugin");
    expect(screenName("/unrecognized/private-data")).toBe("other");
  });

  it("only uses search attribution on a catalog screen", () => {
    expect(modEntryPoint("/mods", true)).toBe("search");
    expect(modEntryPoint("/maps", false)).toBe("catalog");
    expect(modEntryPoint("/albums/a", true)).toBe("album");
    expect(modEntryPoint("/authors/a", true)).toBe("author");
    expect(modEntryPoint("/skins", true)).toBe("skins");
    expect(modEntryPoint("/my-mods", true)).toBe("library");
  });
});
