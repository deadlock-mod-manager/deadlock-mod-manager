import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { RuntimeError } from "@deadlock-mods/common";
import { db } from "@deadlock-mods/database";
import { createMockLogger } from "@deadlock-mods/logging";
import { DistributedLockService } from "./distributed-lock.service";

function setup(renewal: "healthy" | "missing" | "throws") {
  let renewals = 0;
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
  return { service, renewals: () => renewals };
}

afterEach(() => {
  mock.restore();
});

describe("lock ownership after renewal", () => {
  for (const renewal of ["throws", "missing"] satisfies (
    | "throws"
    | "missing"
  )[]) {
    it(`aborts the owner and stops heartbeats when renewal ${renewal}`, async () => {
      const { service, renewals } = setup(renewal);
      try {
        const lock = await service.acquireLock("test-job", {
          heartbeatInterval: 10,
        });
        if (!lock) throw new Error("Expected to acquire the lock");
        await new Promise<void>((resolve) => {
          lock.signal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });
        expect(lock.signal.aborted).toBe(true);
        expect(lock.signal.reason).toBeInstanceOf(RuntimeError);
        const stoppedAt = renewals();
        await Bun.sleep(40);
        expect(renewals()).toBe(stoppedAt);
        await expect(lock.updateHeartbeat()).rejects.toBeInstanceOf(
          RuntimeError,
        );
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
      await lock.updateHeartbeat();
      await Bun.sleep(30);
      expect(renewals()).toBeGreaterThan(1);
      expect(lock.signal.aborted).toBe(false);
    } finally {
      service.cleanup();
    }
  });
});
