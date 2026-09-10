import { $, $$, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { nativeInput } from "../support/native-input";
import {
  ALPHA,
  ALPHA_MODS,
  BETA,
  BETA_MODS,
} from "../support/profile-fixtures";
import {
  assertProfilesDisk,
  readProfileState,
} from "../support/profile-oracle";

const reordered = [ALPHA_MODS[1], ALPHA_MODS[2], ALPHA_MODS[0]];
const openOrdering = async (): Promise<void> => {
  const menu = await $("button=Add Local Mod").$(
    './following-sibling::button[@aria-haspopup="menu"]',
  );
  await menu.waitForClickable();
  await nativeInput("click", menu);
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await $(
    '//*[@role="menuitem" and normalize-space()="Change Mods Order"]',
  ).click();
  await $('[aria-roledescription="sortable"]').waitForDisplayed();
};
const assertOrder = async (order: string[]): Promise<void> => {
  const names = await $('[role="dialog"]')
    .$$("p.font-medium")
    .map((element) => element.getText());
  expect(names).toEqual(order);
};
const switchProfile = async (
  world: string,
  profile: typeof ALPHA,
): Promise<void> => {
  await $('button[aria-label="Active Profile"]').click();
  const control = await $(
    `[role="switch"][aria-label="Activate ${profile.name} profile"]`,
  );
  await control.waitForClickable();
  await control.click();
  await browser.waitUntil(
    async () => (await readProfileState(world)).activeProfileId === profile.id,
  );
  await expect(control).toHaveAttribute("aria-checked", "true");
  await browser.keys("Escape");
  await expect($('button[aria-label="Active Profile"]')).toHaveText(
    expect.stringContaining(profile.name),
  );
  for (const modId of profile.id === ALPHA.id ? ALPHA_MODS : BETA_MODS)
    await expect($(`[title="${modId}"]`)).toBeDisplayed();
  for (const modId of profile.id === ALPHA.id ? BETA_MODS : ALPHA_MODS)
    await expect($(`[title="${modId}"]`)).not.toExist();
};

describe("profile ordering", () => {
  it("persists native ordering and isolates profiles across process restart", async () => {
    const dismiss = await $("button=Got it!");
    if (await dismiss.isDisplayed()) await dismiss.click();
    const runtime = await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke<{
        processId: number;
        roots: { world: string };
      }>("e2e_status"),
    );
    const world = runtime.roots.world;
    await $('a[href="/my-mods"]').click();
    const checkpointPath = path.join(
      world,
      "artifacts",
      "profiles-checkpoint.json",
    );
    if (process.env.DMM_E2E_PHASE === "reorder-switch") {
      await assertProfilesDisk(world, "initial-state", ALPHA.id, ALPHA_MODS);
      await openOrdering();
      await assertOrder(ALPHA_MODS);
      const handles = await $$('[aria-roledescription="sortable"]');
      if (process.env.DMM_E2E_CASE_ID === "profiles-pointer") {
        await nativeInput("drag", handles[0], handles[2]);
      } else {
        await handles[0].click();
        await expect(handles[0]).toBeFocused();
        await nativeInput("keyboard-reorder", handles[0]);
      }
      await assertOrder(reordered);
      await $('[role="dialog"]').$("button=Save").click();
      await browser.waitUntil(
        async () =>
          (await readProfileState(world)).localMods.find(
            (mod) => mod.remoteId === ALPHA_MODS[0],
          )?.installOrder === 2,
      );
      const alpha = await assertProfilesDisk(
        world,
        "reordered",
        ALPHA.id,
        reordered,
      );
      await switchProfile(world, BETA);
      expect(
        await assertProfilesDisk(world, "switched-beta", BETA.id, reordered),
      ).toEqual(alpha);
      await writeFile(
        checkpointPath,
        JSON.stringify({ processId: runtime.processId, alpha }),
      );
    } else if (process.env.DMM_E2E_PHASE === "restart-profiles") {
      const checkpoint = z
        .object({
          processId: z.number(),
          alpha: z.record(z.string(), z.string()),
        })
        .parse(JSON.parse(await readFile(checkpointPath, "utf8")));
      expect(runtime.processId).not.toBe(checkpoint.processId);
      expect(
        await assertProfilesDisk(world, "restarted-beta", BETA.id, reordered),
      ).toEqual(checkpoint.alpha);
      await openOrdering();
      await assertOrder(BETA_MODS);
      await browser.keys("Escape");
      await switchProfile(world, ALPHA);
      expect(
        await assertProfilesDisk(world, "restored-alpha", ALPHA.id, reordered),
      ).toEqual(checkpoint.alpha);
      await openOrdering();
      await assertOrder(reordered);
      await browser.keys("Escape");
    } else throw new Error("Unknown profile phase");
  });
});
