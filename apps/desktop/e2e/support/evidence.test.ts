import { expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureEvidence } from "./evidence";
import { assertInventoryChanges } from "./observations";

it("captures independent evidence after another capture fails", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dmm-evidence-test-"));
  try {
    const failures = await captureEvidence(directory, {
      screenshot: async () => {
        throw new Error("webview closed");
      },
      inventory: async () => {
        await writeFile(path.join(directory, "inventory.json"), "{}");
      },
    });
    expect(failures).toHaveLength(1);
    expect(await readFile(path.join(directory, "inventory.json"), "utf8")).toBe(
      "{}",
    );
    expect(
      await readFile(path.join(directory, "capture-errors.json"), "utf8"),
    ).toContain("webview closed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects added, removed, and changed files outside explicitly permitted paths", () => {
  assertInventoryChanges(
    { kept: "a", allowed: "a" },
    { kept: "a", allowed: "b" },
    ["allowed"],
  );
  const inventories: Record<string, string>[] = [
    { kept: "b" },
    {},
    { kept: "a", surprise: "b" },
  ];
  for (const after of inventories)
    expect(() => assertInventoryChanges({ kept: "a" }, after)).toThrow(
      "Unexpected filesystem changes",
    );
});
