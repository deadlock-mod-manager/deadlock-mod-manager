import { expect, it } from "bun:test";
import {
  CONFLICT_MODS,
  conflictPayload,
  prepareConflictWorld,
} from "./conflict-fixtures";
import { assertConflictDisk } from "./conflict-oracle";
import { createWorld, removeOwnedWorld } from "./world";

it("installs the conflicting mods in load order with their own bytes", async () => {
  const world = await createWorld({
    runId: "conflicts",
    caseId: "conflicts",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  try {
    await prepareConflictWorld(world);
    await assertConflictDisk(world.directory, "recipe", CONFLICT_MODS, null);
    expect(() => conflictPayload("unknown")).toThrow("No conflict recipe");
  } finally {
    await removeOwnedWorld(world.directory);
  }
});
