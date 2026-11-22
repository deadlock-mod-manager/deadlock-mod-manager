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
import { navigate, waitForClickable } from "../support/ui";

const { PRIMARY, RENAMED_FILE, readReliabilityState } = reliabilityFixture;
const toast = (text: string) =>
  $(`//*[@data-sonner-toast and contains(., "${text}")]`);
const modCard = () => $(`[data-library-mod="${PRIMARY.id}"]`);
const openPrimary = async () => {
  await navigate("mods");
  const title = `[title="${PRIMARY.name}"]`;
  await waitForClickable(title);
  await $(title).click();
};
const checkUpdates = async (count: 0 | 1) => {
  await navigate("my-mods");
  const check = await $('button[aria-label="Check for updates"]');
  await check.waitForEnabled({ timeout: 30_000 });
  await check.click();
  await expect(
    toast(count ? "1 update available" : "All mods are up to date"),
  ).toBeDisplayed({ wait: 30_000 });
};

async function exerciseUpdateChoice(world: string) {
  await checkUpdates(1);
  await $("button=1 update available").click();
  const dialog = await $('[role="dialog"]');
  const red = await dialog.$('label[for="download-red.zip"]');
  const blue = await dialog.$('label[for="download-blue.zip"]');
  await expect(red.$('[role="checkbox"]')).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(blue.$('[role="checkbox"]')).toHaveAttribute(
    "aria-checked",
    "false",
  );
  const update = await dialog.$("button*=Update");
  await expect(update).toBeDisabled();
  await red.click();
  await expect(update).toBeEnabled();
  await update.click();
  await observeUntil(
    "Only the chosen update archive is saved",
    () => readReliabilityState(world),
    (state) =>
      state.localMods.find((mod) => mod.remoteId === PRIMARY.id)
        ?.selectedDownloads[0]?.name === "red.zip",
  );
  await assertReliabilityDisk(world, { [PRIMARY.id]: "red" }, "chosen-update");
}

// The lone installed file is gone and the only upload has a different name.
async function exerciseRenamedFile(world: string) {
  await checkUpdates(1);
  await $("button=1 update available").click();
  const update = await $('[role="dialog"]').$("button*=Update");
  await expect(update).toBeEnabled({ wait: 30_000 });
  await update.click();
  await observeUntil(
    "The renamed upload replaces the installed file",
    () => readReliabilityState(world),
    (state) =>
      state.localMods.find((mod) => mod.remoteId === PRIMARY.id)
        ?.selectedDownloads[0]?.name === RENAMED_FILE,
  );
}

describe("mod-updates regressions", () => {
  it("preserves the intended files through the UI and a fresh process", async () => {
    const scenario = z
      .enum([
        "gamebanana-archived-files",
        "gamebanana-update-choice",
        "gamebanana-renamed-single-file",
      ])
      .parse(process.env.DMM_E2E_CASE_ID);
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
    if (scenario === "gamebanana-archived-files") {
      await checkUpdates(0);
      await openPrimary();
      await expect($("button=Update Mod")).not.toBeDisplayed();
      await expect($("button=Force Update")).toBeExisting();
    } else if (scenario === "gamebanana-renamed-single-file") {
      if (phase === "exercise")
        await step("update to the renamed file", () =>
          exerciseRenamedFile(world),
        );
      else await checkUpdates(0);
    } else if (phase === "exercise") {
      await step("choose an update variant", () => exerciseUpdateChoice(world));
    } else {
      await navigate("my-mods");
      await modCard().waitForDisplayed();
    }
    const versions = {
      "gamebanana-archived-files": "original",
      "gamebanana-update-choice": "red",
      "gamebanana-renamed-single-file": "renamed",
    };
    const expected = { [PRIMARY.id]: versions[scenario] };
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
