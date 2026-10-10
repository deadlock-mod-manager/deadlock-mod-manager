import type { AnalyticsProperties, AnalyticsOperations } from "./schema";
import { describe, expect, it } from "bun:test";
import {
  createAnalyticsClient,
  failureOutcome,
  modEntryPoint,
  screenName,
  type AnalyticsContext,
} from "./client";

const startup = {
  total_mods_at_startup: 0,
  installed_mod_count: 0,
  total_profiles_at_startup: 1,
};
const download: AnalyticsOperations["mod_download"]["start"] = {
  mod_id: "fixture",
  entry_point: "catalog",
  content_type: "mod",
  operation_kind: "download",
  file_count: 1,
};
const install: AnalyticsOperations["mod_install"]["start"] = {
  mod_id: "fixture",
  entry_point: "library",
  content_type: "mod",
  operation_kind: "install",
};

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
    expect(test.client.track("page_viewed", { page: "dashboard" })).toBe(false);
    test.setContext({ enabled: true, version: undefined });
    expect(test.client.track("app_ready", startup)).toBe(false);
    const attempt = test.client.start("mod_download", download);
    test.setContext({ version: "2.1.0" });
    expect(attempt.finish("completed")).toBe(false);
    expect(test.events).toEqual([]);
    expect(test.client.track("app_ready", startup)).toBe(true);
    expect(test.events.map((event) => event.name)).toEqual(["app_ready"]);
  });

  it("uses the running release metadata even if callers pass a missing or stale version", () => {
    const test = fixture();
    const untrustedProperties = {
      ...startup,
      app_version: undefined,
      release_channel: "nightly",
      os: "wrong",
      absent: undefined,
      bad_number: NaN,
      infinite: Infinity,
    };
    test.client.track("app_ready", untrustedProperties);
    expect(test.events[0]?.properties).toEqual({
      ...startup,
      app_version: "2.1.0",
      release_channel: "stable",
      os: "windows",
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
    expect(client.track("app_ready", startup)).toBe(false);
    expect(client.start("mod_install", install).finish("completed")).toBe(
      false,
    );
  });
});

describe("analytics action outcomes", () => {
  it("pairs concurrent attempts with independent IDs, source context and duration", () => {
    const test = fixture();
    const first = test.client.start("mod_download", {
      ...download,
      entry_point: "search",
      operation_kind: "download",
    });
    test.setTime(2000);
    const second = test.client.start("mod_install", {
      ...install,
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
    const attempt = test.client.start("mod_install", install);
    expect(attempt.finish("completed")).toBe(true);
    expect(attempt.finish("failed")).toBe(false);
    expect(attempt.finish("cancelled")).toBe(false);
    expect(
      test.events.filter((event) => event.name === "mod_install_result"),
    ).toHaveLength(1);
  });

  it("suppresses results after consent is revoked", () => {
    const test = fixture();
    const attempt = test.client.start("game_launch", { launch_mode: "modded" });
    test.setContext({ enabled: false, consentEpoch: 1 });
    expect(attempt.finish("completed")).toBe(false);
    expect(test.events).toHaveLength(1);
  });

  it("does not resurrect an attempt when consent is disabled then enabled again", () => {
    const test = fixture();
    const oldAttempt = test.client.start("mod_install", install);
    test.setContext({ enabled: false, consentEpoch: 1 });
    test.setContext({ enabled: true, consentEpoch: 2 });
    expect(oldAttempt.finish("completed")).toBe(false);
    const newAttempt = test.client.start("mod_install", install);
    expect(newAttempt.finish("completed")).toBe(true);
    expect(test.events).toHaveLength(3);
  });

  it("clamps duration when the system clock goes backwards", () => {
    const test = fixture();
    const attempt = test.client.start("mod_download", download);
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
    expect(screenName("/collections/164637")).toBe("collection");
    expect(screenName("/authors/private-id")).toBe("author");
    expect(screenName("/plugins/private-name")).toBe("plugin");
    expect(screenName("/unrecognized/private-data")).toBe("other");
  });

  it("only uses search attribution on a catalog screen", () => {
    expect(modEntryPoint("/mods", true)).toBe("search");
    expect(modEntryPoint("/maps", false)).toBe("catalog");
    expect(modEntryPoint("/collections/1", true)).toBe("collection");
    expect(modEntryPoint("/authors/a", true)).toBe("author");
    expect(modEntryPoint("/skins", true)).toBe("skins");
    expect(modEntryPoint("/my-mods", true)).toBe("library");
  });
});

const crash = (): never => {
  throw new Error("Analytics unavailable");
};

describe("analytics never interrupts an action", () => {
  const context: AnalyticsContext = {
    enabled: true,
    version: "2.1.0",
    os: "windows",
    releaseChannel: "stable",
    consentEpoch: 0,
  };
  it.each(["context", "clock", "id", "transport"])(
    "returns an inert attempt when %s fails",
    (failure) => {
      const client = createAnalyticsClient({
        getContext: () => (failure === "context" ? crash() : context),
        now: () => (failure === "clock" ? crash() : 0),
        createId: () => (failure === "id" ? crash() : "id"),
        send: () => {
          if (failure === "transport") crash();
        },
      });
      expect(() => client.track("app_ready", startup)).not.toThrow();
      const attempt = client.start("mod_install", install);
      expect(attempt.finish("completed")).toBe(false);
    },
  );
  it("does not allocate IDs or read the clock while disabled or unready", () => {
    for (const disabled of [
      { ...context, enabled: false },
      { ...context, version: undefined },
    ]) {
      const client = createAnalyticsClient({
        getContext: () => disabled,
        now: crash,
        createId: crash,
        send: crash,
      });
      expect(client.start("mod_install", install).finish("completed")).toBe(
        false,
      );
    }
  });
  it.each(["context", "clock", "transport"])(
    "swallows %s failure during completion without retrying the result",
    (failure) => {
      let completing = false;
      const client = createAnalyticsClient({
        getContext: () =>
          completing && failure === "context" ? crash() : context,
        now: () => (completing && failure === "clock" ? crash() : 0),
        createId: () => "id",
        send: () => {
          if (completing && failure === "transport") crash();
        },
      });
      const attempt = client.start("mod_install", install);
      completing = true;
      expect(attempt.finish("completed")).toBe(false);
      completing = false;
      expect(attempt.finish("completed")).toBe(false);
    },
  );
});
