import { describe, expect, test } from "bun:test";
import { resolveModelConflict } from "./model-conflict-install";

const conflict = {
  kind: "modelConflict",
  message: "Choose a skin",
  conflictingMods: ["josuke"],
};

describe("skin activation choice", () => {
  test("keeping current or dismissing never retries the blocked install", async () => {
    const calls: string[][] = [];
    const result = await resolveModelConflict(
      async (ids) => {
        calls.push(ids);
        throw conflict;
      },
      async () => false,
      () => true,
    );
    expect(result).toBeNull();
    expect(calls).toEqual([[]]);
  });

  test("switching authorizes only the displayed conflicts", async () => {
    const calls: string[][] = [];
    const result = await resolveModelConflict(
      async (ids) => {
        calls.push(ids);
        if (!ids.length) throw conflict;
        return "suit enabled";
      },
      async (ids) => {
        expect(ids).toEqual(["josuke"]);
        return true;
      },
      () => true,
    );
    expect(result).toBe("suit enabled");
    expect(calls).toEqual([[], ["josuke"]]);
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
          return true;
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
          return true;
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
        async () => true,
        () => true,
      ),
    ).rejects.toBe(changed);
    expect(calls).toBe(2);
  });
});
