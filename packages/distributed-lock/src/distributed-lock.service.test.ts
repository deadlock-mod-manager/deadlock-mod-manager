import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { RuntimeError } from "@deadlock-mods/common";
import { db } from "@deadlock-mods/database";
import { createMockLogger } from "@deadlock-mods/logging";
import { DistributedLockService } from "./distributed-lock.service";

function setup(renewal: "healthy" | "missing" | "throws" | "hangs" | "slow") {
  let renewals = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const now = new Date().toISOString();
  spyOn(db.$client, "query").mockImplementation(
    async (query: string | { text: string }) => {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- pg accepts SQL text or a query config.
      const sql = typeof query === "string" ? query : query.text;
      if (sql.startsWith("insert")) {
        return {
          rows: [
            ["lock-test", "test-job", "test-owner", now, now, now, now, now],
          ],
          command: "INSERT",
          rowCount: 1,
          oid: 0,
          fields: [],
        };
      }
      if (sql.startsWith("update")) {
        renewals++;
        if (renewal === "throws") throw new Error("Database unavailable");
        if (renewal === "hangs") return new Promise<never>(() => {});
        if (renewal === "slow") {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await Bun.sleep(35);
          inFlight--;
        }
        return {
          rows: renewal === "missing" ? [] : [["lock-test"]],
          command: "UPDATE",
          rowCount: renewal === "missing" ? 0 : 1,
          oid: 0,
          fields: [],
        };
      }
      return { rows: [], command: "DELETE", rowCount: 0, oid: 0, fields: [] };
    },
  );
  const service = new DistributedLockService(db, createMockLogger(), {
    defaultInstanceId: "test-owner",
  });
  return {
    service,
    renewals: () => renewals,
    maxInFlight: () => maxInFlight,
  };
}

afterEach(() => {
  mock.restore();
});

const aborted = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });

describe("lock ownership after renewal", () => {
  it("aborts the owner and stops heartbeats when renewal matches no row", async () => {
    const { service, renewals } = setup("missing");
    try {
      const lock = await service.acquireLock("test-job", {
        heartbeatInterval: 10,
      });
      if (!lock) throw new Error("Expected to acquire the lock");
      await aborted(lock.signal);
      expect(lock.signal.reason).toBeInstanceOf(RuntimeError);
      expect(renewals()).toBe(1);
      await Bun.sleep(40);
      expect(renewals()).toBe(1);
    } finally {
      service.cleanup();
    }
  });

  for (const renewal of ["throws", "hangs"] satisfies ("throws" | "hangs")[]) {
    it(`keeps the lock while renewals ${renewal}, then aborts before it expires`, async () => {
      const { service, renewals } = setup(renewal);
      try {
        const lock = await service.acquireLock("test-job", {
          heartbeatInterval: 10,
          timeout: 200,
        });
        if (!lock) throw new Error("Expected to acquire the lock");
        await Bun.sleep(50);
        expect(lock.signal.aborted).toBe(false);
        await aborted(lock.signal);
        expect(lock.signal.reason).toBeInstanceOf(RuntimeError);
        const stoppedAt = renewals();
        if (renewal === "hangs") expect(stoppedAt).toBe(1);
        else expect(stoppedAt).toBeGreaterThan(2);
        await Bun.sleep(40);
        expect(renewals()).toBe(stoppedAt);
      } finally {
        service.cleanup();
      }
    });
  }

  it("keeps a healthy owner's signal live", async () => {
    const { service, renewals } = setup("healthy");
    try {
      const lock = await service.acquireLock("test-job", {
        heartbeatInterval: 10,
      });
      if (!lock) throw new Error("Expected to acquire the lock");
      await Bun.sleep(30);
      expect(renewals()).toBeGreaterThan(1);
      expect(lock.signal.aborted).toBe(false);
    } finally {
      service.cleanup();
    }
  });
  it("runs one renewal at a time when renewals are slower than the heartbeat", async () => {
    const { service, renewals, maxInFlight } = setup("slow");
    try {
      const lock = await service.acquireLock("test-job", {
        heartbeatInterval: 10,
        timeout: 400,
      });
      if (!lock) throw new Error("Expected to acquire the lock");
      await Bun.sleep(150);
      expect(renewals()).toBeGreaterThan(2);
      expect(maxInFlight()).toBe(1);
      expect(lock.signal.aborted).toBe(false);
    } finally {
      service.cleanup();
    }
  });
});
