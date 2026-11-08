import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  createMockLogger,
  createWideEvent,
  createWideEventContext,
} from "@deadlock-mods/logging";
import * as Sentry from "@sentry/node";
import { okAsync } from "neverthrow";
import { examplePackSnapshot } from "@/hosted-sources/fixtures/example-pack/pack";
import type { HostedSourceRefreshOutcome } from "./hosted-sources";

mock.module("@/lib/constants", () => ({
  MonitorSlug: { HOSTED_SOURCES: "hosted-sources" },
  SERVER_TIMEZONE: "UTC",
}));

const stored = new Map<string, string>();
mock.module("@/lib/redis", () => ({
  redis: { get: async (key: string) => stored.get(key) ?? null },
}));
mock.module("@/lib/logger", () => ({
  logger: createMockLogger(),
  createWideEvent,
  wideEventContext: createWideEventContext(),
}));
mock.module("./feature-flags", () => ({
  FeatureFlagsServiceSingleton: {
    getInstance: () => ({ isFeatureEnabled: () => okAsync(false) }),
  },
}));

const { HostedSourcesService } = await import("./hosted-sources");
const { HostedSourcesProcessor } = await import("../processors/hosted-sources");

afterEach(() => {
  stored.clear();
  mock.restore();
});

describe("hosted source cache", () => {
  it.each(["{", "null"])(
    "recovers from an invalid cached snapshot: %s",
    async (raw) => {
      const key = "hosted-source:pack:snapshot";
      stored.set(key, raw);
      const service = HostedSourcesService.getInstance();
      expect(await service.getSnapshot("pack")).toBeNull();

      stored.set(key, JSON.stringify(examplePackSnapshot));
      expect(await service.getSnapshot("pack")).toEqual(examplePackSnapshot);
    },
  );
});

describe("hosted source refresh monitoring", () => {
  const cases: {
    outcomes: Record<string, HostedSourceRefreshOutcome>;
    success: boolean;
    checkInStatus: "ok" | "error";
  }[] = [
    { outcomes: { pack: "unchanged" }, success: true, checkInStatus: "ok" },
    {
      outcomes: { first: "updated", second: "failed" },
      success: false,
      checkInStatus: "error",
    },
  ];

  it.each(cases)(
    "reports $outcomes as success=$success",
    async ({ outcomes, success, checkInStatus }) => {
      spyOn(HostedSourcesService.getInstance(), "refreshAll").mockResolvedValue(
        outcomes,
      );
      const checkIn = spyOn(Sentry, "captureCheckIn").mockReturnValue(
        "check-in-id",
      );
      const result = await HostedSourcesProcessor.getInstance().process({
        jobData: {},
      });

      expect(result.success).toBe(success);
      expect(checkIn).toHaveBeenLastCalledWith({
        checkInId: "check-in-id",
        monitorSlug: HostedSourcesProcessor.monitorSlug,
        status: checkInStatus,
      });
    },
  );
});
