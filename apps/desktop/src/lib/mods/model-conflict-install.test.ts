import { describe, expect, test } from "bun:test";
import {
  type ModelConflictResolution,
  resolveModelConflict,
} from "./model-conflict-install";

const conflict = {
  kind: "modelConflict",
  message: "Choose a skin",
  conflictingMods: ["josuke"],
};

describe("skin activation choice", () => {
  test("keeping current or dismissing never retries the blocked install", async () => {
    const calls: ModelConflictResolution[] = [];
    const result = await resolveModelConflict(
      async (resolution) => {
        calls.push(resolution);
        throw conflict;
      },
      async () => null,
      () => true,
    );
    expect(result).toBeNull();
    expect(calls).toEqual([{ replace: [], allow: [] }]);
  });

  test("switching authorizes only the displayed conflicts", async () => {
    const calls: ModelConflictResolution[] = [];
    const result = await resolveModelConflict(
      async (resolution) => {
        calls.push(resolution);
        if (!resolution.replace.length) throw conflict;
        return "suit enabled";
      },
      async (ids) => {
        expect(ids).toEqual(["josuke"]);
        return "replace";
      },
      () => true,
    );
    expect(result).toBe("suit enabled");
    expect(calls).toEqual([
      { replace: [], allow: [] },
      { replace: ["josuke"], allow: [] },
    ]);
  });

  test("keeping both allows the conflicts without replacing them", async () => {
    const calls: ModelConflictResolution[] = [];
    await resolveModelConflict(
      async (resolution) => {
        calls.push(resolution);
        if (!resolution.allow.length) throw conflict;
        return "both enabled";
      },
      async () => "keepBoth",
      () => true,
    );
    expect(calls[1]).toEqual({ replace: [], allow: ["josuke"] });
  });

  test("a changed profile invalidates a pending choice", async () => {
    let sameProfile = true;
    let calls = 0;
    expect(
      await resolveModelConflict(
        async () => {
          calls++;
          throw conflict;
        },
        async () => {
          sameProfile = false;
          return "replace";
        },
        () => sameProfile,
      ),
    ).toBeNull();
    expect(calls).toBe(1);
  });

  test("unrelated errors propagate without a skin prompt", async () => {
    let prompts = 0;
    const failure = new Error("disk unavailable");
    await expect(
      resolveModelConflict(
        async () => {
          throw failure;
        },
        async () => {
          prompts++;
          return "replace";
        },
        () => true,
      ),
    ).rejects.toBe(failure);
    expect(prompts).toBe(0);
  });

  test("new conflicts during confirmation are not silently approved", async () => {
    let calls = 0;
    const changed = { ...conflict, conflictingMods: ["third-skin"] };
    await expect(
      resolveModelConflict(
        async () => {
          throw ++calls === 1 ? conflict : changed;
        },
        async () => "replace",
        () => true,
      ),
    ).rejects.toBe(changed);
    expect(calls).toBe(2);
  });
});
