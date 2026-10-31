import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import type { SessionReport } from "../../src/lib/launch-health/types";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  reliabilityFixture,
  assertReliabilityDisk,
} from "../support/reliability-fixtures";
import { navigate, waitForOverlaysClosed } from "../support/ui";

import { crashReport } from "../support/crash-attribution-fixtures";
const { PRIMARY } = reliabilityFixture;
const modCard = () => $(`[data-library-mod="${PRIMARY.id}"]`);
// E2E launches record game requests instead of starting Deadlock. Feed its real
// event boundary; resource-to-VPK attribution is covered by Rust integration tests.
const deliverReport = (report: SessionReport) =>
  browser.execute(
    (payload: SessionReport) =>
      window["__TAURI_INTERNALS__"].invoke("plugin:event|emit", {
        event: "game-session-ended",
        payload,
      }),
    report,
  );
async function exerciseCrashCause(world: string) {
  await navigate("my-mods");
  await modCard().waitForDisplayed();
  await deliverReport(crashReport(false));
  let dialog = await $('[role="dialog"]');
  await expect(dialog).toHaveText(
    expect.stringContaining("Deadlock closed unexpectedly"),
  );
  await expect(dialog).not.toHaveText(
    expect.stringContaining("Possible crash cause"),
  );
  await dialog.$("button=I closed it").click();
  await waitForOverlaysClosed();
  await expect(modCard()).not.toHaveText(
    expect.stringContaining("Possible crash cause"),
  );
  await deliverReport(crashReport(true));
  dialog = await $('[role="dialog"]');
  const suspect = await dialog.$(
    '[role="region"][aria-labelledby="crash-suspect-heading"]',
  );
  await expect(suspect).toHaveText(
    expect.stringContaining("Possible crash cause"),
  );
  await expect(suspect).toHaveText(expect.stringContaining(PRIMARY.name));
  await expect(dialog).toHaveText(
    expect.stringContaining("scripts/e2e-reliability.vdata_c"),
  );
  await expect(suspect).toHaveText(
    expect.stringContaining("It may be involved."),
  );
  await dialog.$("button=I closed it").click();
  await waitForOverlaysClosed();
  await expect(modCard()).toHaveText(
    expect.stringContaining("Possible crash cause"),
  );
  await assertReliabilityDisk(
    world,
    { [PRIMARY.id]: "original" },
    "crash-clue-preserves-mods",
  );
}

describe("crash-attribution regressions", () => {
  it("preserves the intended files through the UI and a fresh process", async () => {
    z.enum(["gamebanana-crash-cause"]).parse(process.env.DMM_E2E_CASE_ID);
    const phase = z
      .enum(["exercise", "restart"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(
      world,
      "artifacts",
      "reliability-process.json",
    );
    if (phase === "restart") {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, previous.processId);
    }
    if (phase === "exercise") {
      await step("crash-attribution", () => exerciseCrashCause(world));
    } else {
      await navigate("my-mods");
      await modCard().waitForDisplayed();
      await expect(modCard()).not.toHaveText(
        expect.stringContaining("Possible crash cause"),
      );
    }
    const expected = { [PRIMARY.id]: "original" };
    await assertReliabilityDisk(world, expected, `${phase}-reliability`);
    await writeFile(
      checkpoint,
      JSON.stringify({ processId: runtime.processId }),
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", `${phase}-reliability.png`),
    );
    await writeFile(
      path.join(world, "artifacts", `${phase}-reliability.html`),
      await browser.getPageSource(),
    );
    await closeApplication(world, runtime.processId);
    await assertReliabilityDisk(world, expected, `closed-${phase}-reliability`);
  });
});
