import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import {
  reliabilityFixture,
  assertReliabilityDisk,
} from "../support/reliability-fixtures";
import { navigate, reveal } from "../support/ui";

const { PRIMARY, readReliabilityState } = reliabilityFixture;
const toggle = (name: string) =>
  $(`[role="switch"][aria-label="Enable mod ${name}"]`);
const modCard = () => $(`[data-library-mod="${PRIMARY.id}"]`);
const openPrimary = async () => {
  await navigate("mods");
  const title = await $(`[title="${PRIMARY.name}"]`);
  await title.waitForClickable();
  await title.click();
};
const waitStatus = (world: string, id: string, status: string) =>
  observeUntil(
    `${id} becomes ${status}`,
    () => readReliabilityState(world),
    (state) =>
      state.localMods.some(
        (mod) => mod.remoteId === id && mod.status === status,
      ),
  );
async function exerciseMirrorFallback(world: string) {
  await openPrimary();
  await $('button[aria-label="Download Mod"]').click();
  await waitStatus(world, PRIMARY.id, "downloaded");
  await reveal(await toggle(PRIMARY.name));
  await toggle(PRIMARY.name).waitForClickable();
  await toggle(PRIMARY.name).click();
  await waitStatus(world, PRIMARY.id, "installed");
  await expect(toggle(PRIMARY.name)).toHaveAttribute("aria-checked", "true");
  await assertReliabilityDisk(
    world,
    { [PRIMARY.id]: "original" },
    "fallback-installed",
  );
}

describe("download-fallback regressions", () => {
  it("preserves the intended files through the UI and a fresh process", async () => {
    z.enum(["gamebanana-mirror-fallback"]).parse(process.env.DMM_E2E_CASE_ID);
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
      await step("download-fallback", () => exerciseMirrorFallback(world));
    } else {
      await navigate("my-mods");
      await modCard().waitForDisplayed();
      await expect(toggle(PRIMARY.name)).toHaveAttribute(
        "aria-checked",
        "true",
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
