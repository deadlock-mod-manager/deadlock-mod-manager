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
import { assertOwnedWorld, collectFileInventory } from "../support/world";

const { PRIMARY, BASE, BLOCKED, RELIABILITY_PROFILE, readReliabilityState } =
  reliabilityFixture;
const toggle = (name: string) =>
  $(`[role="switch"][aria-label="Enable mod ${name}"]`);
const toast = (text: string) =>
  $(`//*[@data-sonner-toast and contains(., "${text}")]`);
const requirement = (name: string) => $(`//li[contains(., "${name}")]`);
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
async function exerciseRequirements(world: string) {
  await openPrimary();
  await expect(requirement(BASE.name)).toHaveText(
    expect.stringContaining("Missing"),
  );
  await expect(requirement(BLOCKED.name)).toHaveText(
    expect.stringContaining("Must be disabled"),
  );
  const baseRow = await requirement(BASE.name);
  await reveal(baseRow);
  await baseRow.$('button[aria-label="Download Mod"]').click();
  await waitStatus(world, BASE.id, "downloaded");
  await expect(requirement(BASE.name)).toHaveText(
    expect.stringContaining("Not enabled"),
  );
  const download = await $('button[aria-label="Download Mod"]');
  await reveal(download);
  await download.click();
  await waitStatus(world, PRIMARY.id, "downloaded");
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const addonDirectory = path.join(
    roots.game,
    "game/citadel/addons",
    RELIABILITY_PROFILE.folder,
  );
  const before = await collectFileInventory(addonDirectory);
  await reveal(await toggle(PRIMARY.name));
  await toggle(PRIMARY.name).waitForClickable();
  await toggle(PRIMARY.name).click();
  const warning = await $('[role="alertdialog"]');
  await expect(warning).toHaveText(expect.stringContaining(BASE.name));
  await expect(warning).toHaveText(expect.stringContaining(BLOCKED.name));
  await warning.$("button=Cancel").click();
  await expect(warning).not.toBeDisplayed();
  assert.equal(
    (await readReliabilityState(world)).localMods.find(
      (mod) => mod.remoteId === PRIMARY.id,
    )?.status,
    "downloaded",
  );
  assert.deepEqual(await collectFileInventory(addonDirectory), before);

  await reveal(await toggle(BASE.name));
  await toggle(BASE.name).waitForClickable();
  await toggle(BASE.name).click();
  await waitStatus(world, BASE.id, "installed");
  await reveal(await toggle(BLOCKED.name));
  await toggle(BLOCKED.name).waitForClickable();
  await toggle(BLOCKED.name).click();
  await waitStatus(world, BLOCKED.id, "downloaded");
  await expect(requirement(BLOCKED.name)).toHaveText(
    expect.stringContaining("Not enabled"),
  );
  await reveal(await toggle(PRIMARY.name));
  await toggle(PRIMARY.name).waitForClickable();
  await toggle(PRIMARY.name).click();
  await waitStatus(world, PRIMARY.id, "installed");
  await expect($('[role="alertdialog"]')).not.toBeDisplayed();
  const reorder = await requirement(BASE.name).$(
    "button=Load this mod before its requirement",
  );
  await reveal(reorder);
  await reorder.click();
  await expect(toast(`${PRIMARY.name} now loads first`)).toBeDisplayed();
  const manifest = await assertReliabilityDisk(
    world,
    { [PRIMARY.id]: "original", [BASE.id]: "original" },
    "requirements-fixed",
  );
  assert(
    manifest.mods[PRIMARY.id].currentVpks[0] <
      manifest.mods[BASE.id].currentVpks[0],
  );
  assert.equal(manifest.mods[BLOCKED.id].enabled, false);
  assert.equal(manifest.mods[BLOCKED.id].disabledVpks.length, 1);
}

describe("mod-requirements regressions", () => {
  it("preserves the intended files through the UI and a fresh process", async () => {
    z.enum(["gamebanana-requirements"]).parse(process.env.DMM_E2E_CASE_ID);
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
      await step("mod-requirements", () => exerciseRequirements(world));
    } else {
      await navigate("my-mods");
      await modCard().waitForDisplayed();
      await expect(modCard()).not.toHaveText(
        expect.stringContaining("unmet requirement"),
      );
    }
    const expected = { [PRIMARY.id]: "original", [BASE.id]: "original" };
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
