import assert from "node:assert/strict";
import { $ } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  assertRepairDisk,
  isRepaired,
  readRepairState,
} from "../support/manifest-repair-oracle";
import { observeUntil } from "../support/observations";

const awaitRepair = (world: string, label: string) =>
  observeUntil(
    `${label}: install state was never restored from the manifest`,
    () => readRepairState(world),
    isRepaired,
  );

/**
 * The broken state the user reports is a navigation badge counting mods stuck
 * in a transfer. The sidebar renders on every route, so reading it there cannot
 * race the page the application happens to be on.
 */
const assertNoQueuedDownloads = () =>
  step("no downloads are queued", async () => {
    const entry = await $('a[href="/downloads"]');
    await entry.waitForDisplayed();
    const label = await entry.getText();
    assert.doesNotMatch(
      label,
      /\d/,
      `Downloads still counts queued transfers: ${label}`,
    );
  });

describe("manifest repair", () => {
  it("restores install state a migrated store lost, without touching files", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    if (phase !== "repair" && phase !== "restart-repair")
      throw new Error("Unknown manifest repair phase");

    // Seeded stale on the first process; already repaired and saved on the second.
    await awaitRepair(world, phase);
    await assertRepairDisk(world, phase);
    await assertNoQueuedDownloads();

    await closeApplication(world, runtime.processId);
    await assertRepairDisk(world, `closed-${phase}`);
  });
});
