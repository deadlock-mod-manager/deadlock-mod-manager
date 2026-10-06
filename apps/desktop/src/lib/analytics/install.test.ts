import { describe, expect, it } from "bun:test";
import { ModStatus, type LocalMod, type InstallableMod } from "@/types/mods";
import {
  createAnalyticsClient,
  type AnalyticsProperties,
  type AnalyticsMilestone,
} from "./client";
import { createInstallTracker, type InstallAnalyticsOptions } from "./install";

const mod: LocalMod = {
  id: "fixture",
  remoteId: "fixture",
  name: "Fixture",
  description: null,
  remoteUrl: "https://gamebanana.com/mods/1",
  category: "Skins",
  likes: 0,
  author: "Fixture",
  modAuthorId: null,
  downloadable: true,
  remoteAddedAt: new Date(0),
  remoteUpdatedAt: new Date(0),
  tags: [],
  images: [],
  hero: null,
  isAudio: false,
  isMap: false,
  audioUrl: null,
  downloadCount: 0,
  isNSFW: false,
  isObsolete: false,
  isBlacklisted: false,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  filesUpdatedAt: null,
  metadata: null,
  dependencies: null,
  overrides: null,
  createdAt: null,
  updatedAt: null,
  status: ModStatus.Downloaded,
};
const result: InstallableMod = {
  id: "fixture",
  name: "Fixture",
  installed_vpks: ["pak01_dir.vpk"],
};

const fixture = () => {
  const events: { name: string; properties: AnalyticsProperties }[] = [];
  const milestones: AnalyticsMilestone[] = [];
  const callbacks: string[] = [];
  let enabled = true;
  const client = createAnalyticsClient({
    getContext: () => ({
      enabled,
      version: "2.1.0",
      os: "linux",
      releaseChannel: "stable",
      consentEpoch: 0,
    }),
    send: (name, properties) => {
      events.push({ name, properties });
    },
    now: () => 0,
    createId: () => "attempt",
  });
  const track = createInstallTracker({
    start: client.start,
    getModEntryPoint: () => "search",
    captureMilestone: (milestone) => {
      milestones.push(milestone);
    },
  });
  const options: InstallAnalyticsOptions = {
    onStart: () => {
      callbacks.push("start");
    },
    onComplete: () => {
      callbacks.push("complete");
    },
    onError: () => {
      callbacks.push("error");
    },
    onCancel: () => {
      callbacks.push("cancel");
    },
  };
  return {
    events,
    milestones,
    callbacks,
    track,
    options,
    disable: () => {
      enabled = false;
    },
  };
};

describe("installation analytics at the shared operation boundary", () => {
  it("keeps the attempt open during file selection and settles only on confirmation", () => {
    const test = fixture();
    const options = test.track(mod, test.options);
    options.onStart(mod);
    expect(test.events.map((event) => event.name)).toEqual([
      "mod_install_started",
    ]);
    options.onComplete(mod, result);
    expect(test.events[1]?.properties).toMatchObject({
      outcome: "completed",
      entry_point: "search",
      operation_kind: "install",
      vpk_count: 1,
    });
    expect(test.milestones).toEqual(["first_install_completed"]);
    expect(test.callbacks).toEqual(["start", "complete"]);
  });

  it("reports file-selector cancellation without claiming an installation", () => {
    const test = fixture();
    const options = test.track(mod, test.options);
    options.onCancel(mod);
    expect(test.events[1]?.properties.outcome).toBe("cancelled");
    expect(test.milestones).toEqual([]);
    expect(test.callbacks).toEqual(["cancel"]);
  });

  it("reports a game guard block without sending the diagnostic message", () => {
    const test = fixture();
    test
      .track(mod, test.options)
      .onError(mod, { kind: "gameRunning", message: "Private file path" });
    expect(test.events[1]?.properties.outcome).toBe("blocked");
    expect(JSON.stringify(test.events)).not.toContain("Private file path");
    expect(test.milestones).toEqual([]);
    expect(test.callbacks).toEqual(["error"]);
  });

  it("separates re-enabling a downloaded mod from its first installation", () => {
    const test = fixture();
    const restored = { ...mod, installedVpks: ["pak01_dir.vpk"] };
    test.track(restored, test.options).onComplete(restored, result);
    expect(test.events[1]?.properties.operation_kind).toBe("enable");
    expect(test.milestones).toEqual([]);
  });

  it("uses explicit one-click source context", () => {
    const test = fixture();
    test
      .track(mod, { ...test.options, analyticsEntryPoint: "deep_link" })
      .onComplete(mod, result);
    expect(test.events[1]?.properties.entry_point).toBe("deep_link");
  });

  it("does not count reinstall or randomizer operations as activation", () => {
    for (const operation of ["reinstall", "randomize"]) {
      const test = fixture();
      if (operation === "reinstall") {
        test
          .track(mod, { ...test.options, analyticsOperationKind: "reinstall" })
          .onComplete(mod, result);
      } else {
        test
          .track(mod, { ...test.options, analyticsOperationKind: "randomize" })
          .onComplete(mod, result);
      }
      expect(test.events[1]?.properties.operation_kind).toBe(operation);
      expect(test.milestones).toEqual([]);
    }
  });

  it("does not duplicate results or activation when callbacks fire again", () => {
    const test = fixture();
    const options = test.track(mod, test.options);
    options.onComplete(mod, result);
    options.onComplete(mod, result);
    options.onError(mod, { kind: "io", message: "Callback failure" });
    expect(test.events).toHaveLength(2);
    expect(test.milestones).toEqual(["first_install_completed"]);
  });

  it("preserves application callbacks while analytics is disabled", () => {
    const test = fixture();
    test.disable();
    const options = test.track(mod, test.options);
    options.onStart(mod);
    options.onComplete(mod, result);
    expect(test.callbacks).toEqual(["start", "complete"]);
    expect(test.events).toEqual([]);
    expect(test.milestones).toEqual([]);
  });
});
