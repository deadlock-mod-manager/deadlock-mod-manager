import { afterEach, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runE2eWorld } from "./supervisor";
import { removeOwnedWorld } from "./world";

const worlds: string[] = [];
afterEach(async () => {
  for (const world of worlds.splice(0)) await removeOwnedWorld(world);
});
it("rejects native desktop scenarios before launching without explicit opt-in", async () => {
  let launched = false;
  await expect(
    runE2eWorld({
      provider: "embedded",
      runId: "native-opt-in",
      caseId: "profiles-pointer",
      attempt: 1,
      runPhase: async () => {
        launched = true;
        return { exitCode: 0, output: "" };
      },
    }),
  ).rejects.toThrow("--allow-native-input");
  expect(launched).toBe(false);
});
for (const fault of ["launch", "oracle"]) {
  it(`retains final inventories and the original ${fault} failure`, async () => {
    const result = await runE2eWorld({
      provider: "embedded",
      runId: "supervisor-unit",
      caseId: "about-smoke",
      attempt: 1,
      runPhase: async () => {
        if (fault === "launch") throw new Error("synthetic launch failure");
        return { exitCode: 0, output: "" };
      },
    });
    worlds.push(result.worldDirectory);
    expect(result.passed).toBe(false);
    const document = await readFile(
      path.join(result.worldDirectory, "artifacts", "result.json"),
      "utf8",
    );
    expect(document).toContain(
      fault === "launch"
        ? "synthetic launch failure"
        : "phase-completed-smoke.json",
    );
    expect(
      await readFile(
        path.join(result.worldDirectory, "artifacts", "files-after.json"),
        "utf8",
      ),
    ).toContain('"game"');
    expect(
      await readFile(
        path.join(result.worldDirectory, "artifacts", "network.ndjson"),
        "utf8",
      ),
    ).toBe("");
  });
}
