import { describe, expect, it } from "bun:test";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import type { LocalMod } from "@/types/mods";
import type { ErrorKind } from "@/types/tauri";
import { runBulkModAction } from "./bulk-action";

const mod = (remoteId: string): LocalMod =>
  placeholderModFromManifest(
    remoteId,
    {
      enabled: true,
      shard: 1,
      currentVpks: ["pak01_dir.vpk"],
      disabledVpks: [],
      originalVpkNames: [`${remoteId}.vpk`],
    },
    ["pak01_dir.vpk"],
  );
const a = mod("a");
const b = mod("b");
const c = mod("c");
const targets = [a, b, c];
const ids = (mods: readonly LocalMod[]) => mods.map((m) => m.remoteId);

const failingOn =
  (remoteId: string, error: ErrorKind | Error, applied: string[]) =>
  async (target: LocalMod) => {
    applied.push(target.remoteId);
    if (target.remoteId === remoteId) throw error;
  };

describe("runBulkModAction", () => {
  it("reports every mod as completed when nothing fails", async () => {
    const applied: string[] = [];
    const recap = await runBulkModAction({
      action: "disable",
      targets,
      isCurrent: () => true,
      apply: async (target) => {
        applied.push(target.remoteId);
      },
    });
    expect(applied).toEqual(["a", "b", "c"]);
    expect(recap.stoppedBy).toBeNull();
    expect(ids(recap.completed)).toEqual(["a", "b", "c"]);
    expect(recap.failed).toBeNull();
    expect(recap.notAttempted).toEqual([]);
  });

  it("stops at the first failure even when it is the first mod", async () => {
    const applied: string[] = [];
    const recap = await runBulkModAction({
      action: "delete",
      targets,
      isCurrent: () => true,
      apply: failingOn("a", new Error("disk full"), applied),
    });
    expect(applied).toEqual(["a"]);
    expect(recap.stoppedBy).toBe("error");
    expect(recap.completed).toEqual([]);
    expect(recap.failed).toEqual({ mod: a, message: "disk full" });
    expect(ids(recap.notAttempted)).toEqual(["b", "c"]);
  });

  it("has nothing left to skip when the last mod fails", async () => {
    const recap = await runBulkModAction({
      action: "disable",
      targets,
      isCurrent: () => true,
      apply: failingOn("c", new Error("locked"), []),
    });
    expect(ids(recap.completed)).toEqual(["a", "b"]);
    expect(recap.failed?.mod).toBe(c);
    expect(recap.notAttempted).toEqual([]);
  });

  it("appends guidance for a backend error the caller recognizes", async () => {
    const inUse: ErrorKind = { kind: "vpkInUse", message: "pak02 is open" };
    const recap = await runBulkModAction({
      action: "delete",
      targets,
      isCurrent: () => true,
      apply: failingOn("b", inUse, []),
      hintFor: (error) =>
        error.kind === "vpkInUse" ? "Close Deadlock." : undefined,
    });
    expect(recap.failed?.message).toBe("pak02 is open Close Deadlock.");
  });

  it("leaves the blocked mod and the rest unattempted when the game keeps running", async () => {
    const applied: string[] = [];
    const recap = await runBulkModAction({
      action: "disable",
      targets,
      isCurrent: () => true,
      apply: failingOn(
        "b",
        { kind: "gameRunning", message: "Deadlock is running" },
        applied,
      ),
    });
    expect(applied).toEqual(["a", "b"]);
    expect(recap.stoppedBy).toBe("gameRunning");
    expect(ids(recap.completed)).toEqual(["a"]);
    expect(recap.failed).toBeNull();
    expect(ids(recap.notAttempted)).toEqual(["b", "c"]);
  });

  it("stops before the next mod once the active profile changes", async () => {
    const applied: string[] = [];
    let current = true;
    const recap = await runBulkModAction({
      action: "delete",
      targets,
      isCurrent: () => current,
      apply: async (target) => {
        applied.push(target.remoteId);
        current = false;
      },
    });
    expect(applied).toEqual(["a"]);
    expect(recap.stoppedBy).toBe("profileChanged");
    expect(ids(recap.completed)).toEqual(["a"]);
    expect(recap.failed).toBeNull();
    expect(ids(recap.notAttempted)).toEqual(["b", "c"]);
  });

  it("attempts nothing when the profile changed before the run started", async () => {
    const applied: string[] = [];
    const recap = await runBulkModAction({
      action: "disable",
      targets,
      isCurrent: () => false,
      apply: async (target) => {
        applied.push(target.remoteId);
      },
    });
    expect(applied).toEqual([]);
    expect(recap.stoppedBy).toBe("profileChanged");
    expect(ids(recap.notAttempted)).toEqual(["a", "b", "c"]);
  });
});
