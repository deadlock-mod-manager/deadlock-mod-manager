import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { assertOwnedWorld } from "./world";

export const observeUntil = async <T>(
  label: string,
  read: () => Promise<T>,
  accepts: (value: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (accepts(value)) return value;
    if (Date.now() >= deadline)
      throw new Error(`${label}: last observation ${JSON.stringify(value)}`);
    await setTimeout(100);
  }
};

export const inventorySchema = z.record(z.string(), z.string());
export const fingerprint = (bytes: Uint8Array): string =>
  `${bytes.length}:${createHash("sha256").update(bytes).digest("hex")}`;

export const readPersistedDocument = async (world: string) => {
  const { configuration } = await assertOwnedWorld(world);
  const store = z
    .object({ "local-config": z.string() })
    .parse(
      JSON.parse(
        await readFile(
          path.join(configuration.roots.appData, "state.json"),
          "utf8",
        ),
      ),
    );
  return z.json().parse(JSON.parse(store["local-config"]));
};

export const assertInventoryChanges = (
  before: Record<string, string>,
  after: Record<string, string>,
  allowed: readonly string[] = [],
): void => {
  const permitted = new Set(allowed);
  const changes = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].filter((name) => before[name] !== after[name] && !permitted.has(name));
  assert.deepEqual(
    changes.sort(),
    [],
    `Unexpected filesystem changes: ${changes.join(", ")}`,
  );
};
