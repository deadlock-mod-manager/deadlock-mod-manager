import { expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { createWorld, removeOwnedWorld } from "./world";
import { readPersistedDocument } from "./observations";

it("waits for an in-progress persisted store write to finish", async () => {
  const world = await createWorld({
    runId: "unit",
    caseId: "store-write",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  try {
    const file = path.join(world.configuration.roots.appData, "state.json");
    const original = await readFile(file, "utf8");
    await writeFile(file, "{");
    const writer = setTimeout(100).then(() => writeFile(file, original));
    const observed = await readPersistedDocument(world.directory);
    await writer;
    expect(observed).toEqual(JSON.parse(JSON.parse(original)["local-config"]));
  } finally {
    await removeOwnedWorld(world.directory);
  }
});
