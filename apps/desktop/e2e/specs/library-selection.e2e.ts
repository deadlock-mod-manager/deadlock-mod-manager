import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  ALPHA,
  ALPHA_MODS,
  BETA,
  BETA_MODS,
  profilePayload,
} from "../support/profile-fixtures";
import {
  fingerprint,
  observeUntil,
  readPersistedDocument,
} from "../support/observations";
import { activateProfile, navigate } from "../support/ui";
import { assertOwnedWorld, collectFileInventory } from "../support/world";

const stateSchema = z.object({
  state: z.object({
    localMods: z.array(z.object({ remoteId: z.string(), status: z.string() })),
  }),
});
const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      currentVpks: z.array(z.string()),
      disabledVpks: z.array(z.string()),
    }),
  ),
});
const verify = async (world: string, disabled: readonly string[]) => {
  await observeUntil(
    "selected mod statuses persisted",
    async () =>
      stateSchema.parse(await readPersistedDocument(world)).state.localMods,
    (mods) =>
      mods.length === ALPHA_MODS.length &&
      mods.every(
        (mod) =>
          mod.status ===
          (disabled.includes(mod.remoteId) ? "downloaded" : "installed"),
      ),
  );
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  for (const { profile, ids } of [
    { profile: ALPHA, ids: ALPHA_MODS },
    { profile: BETA, ids: BETA_MODS },
  ]) {
    const directory = path.join(
      roots.game,
      "game",
      "citadel",
      "addons",
      profile.folder,
    );
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
    );
    const inventory = await collectFileInventory(directory);
    for (const id of ids) {
      const entry = manifest.mods[id];
      assert.equal(entry.enabled, !disabled.includes(id));
      for (const name of [...entry.currentVpks, ...entry.disabledVpks]) {
        assert.equal(inventory[name], fingerprint(profilePayload(id)));
      }
      if (!entry.enabled) assert.equal(entry.currentVpks.length, 0);
    }
    assert.deepEqual(
      Object.keys(inventory).sort(),
      [
        ".dmm.json",
        "protected.txt",
        ...Object.values(manifest.mods).flatMap((entry) =>
          entry.currentVpks.concat(entry.disabledVpks),
        ),
      ].sort(),
    );
    assert.equal(
      inventory["protected.txt"],
      fingerprint(Buffer.from(`Protected ${profile.name}\n`)),
    );
    assert.equal(
      Object.keys(inventory).filter((name) => /^pak\d+_dir\.vpk$/.test(name))
        .length,
      ids.filter((id) => !disabled.includes(id)).length,
    );
  }
};

const confirm = async (action: string) => {
  const dialog = $('[role="alertdialog"]');
  await dialog.waitForDisplayed();
  await dialog.$(`button=${action}`).click();
  await expect(dialog).not.toBeDisplayed();
};

describe("selected library actions", () => {
  it("only changes selected mods and clears selection across profiles and restarts", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    const [first, second, third] = ALPHA_MODS;
    if (process.env.DMM_E2E_PHASE === "select") {
      await verify(world, []);
      await $("button=Select mods").click();
      for (const id of [first, third])
        await $(`[role="checkbox"][aria-label="Select ${id}"]`).click();
      await expect($('[role="region"][aria-label="Select mods"]')).toHaveText(
        expect.stringContaining("2 mods selected"),
      );
      await browser.saveScreenshot(
        path.join(world, "artifacts", "library-selection.png"),
      );
      await $('button[aria-label="List view"]').click();
      for (const id of ALPHA_MODS)
        await expect(
          $(`[role="checkbox"][aria-label="Select ${id}"]`),
        ).toHaveAttribute("aria-checked", String(id !== second));
      await browser.saveScreenshot(
        path.join(world, "artifacts", "library-selection-list.png"),
      );
      await $('button[aria-label="Grid view"]').click();
      await $("button=Disable selected").click();
      await confirm("Cancel");
      await verify(world, []);
      await $("button=Disable selected").click();
      await confirm("Disable selected");
      await verify(world, [first, third]);
      await $("button=Enable selected").waitForEnabled();
      await $("button=Enable selected").click();
      await confirm("Enable selected");
      const recap = $('[role="dialog"]');
      await expect(recap).toHaveText(
        expect.stringContaining("All 2 mods were enabled."),
      );
      await recap.$("button=Close").click();
      await verify(world, []);
      await $("button=Clear selection").click();
      const search = $("#search");
      await search.setValue("two");
      await expect(
        $$('[role="checkbox"][aria-label^="Select local-alpha-"]'),
      ).toBeElementsArrayOfSize(1);
      await $("button=Select all matching").click();
      await expect($('[role="region"][aria-label="Select mods"]')).toHaveText(
        expect.stringContaining("1 mod selected"),
      );
      await $("button=Disable selected").click();
      await confirm("Disable selected");
      await verify(world, [second]);
      await search.clearValue();
      await $('button[aria-label="Active Profile"]').click();
      await expect(
        $(`button[aria-label="Edit ${ALPHA.name} profile"]`),
      ).toBeDisplayed();
      await expect(
        $(`button[aria-label="Delete ${BETA.name} profile"]`),
      ).toBeDisplayed();
      await browser.keys("Escape");
      await activateProfile(BETA.name);
      await expect(
        $('[role="region"][aria-label="Select mods"]'),
      ).not.toBeDisplayed();
      await activateProfile(ALPHA.name);
      await expect(
        $('[role="region"][aria-label="Select mods"]'),
      ).not.toBeDisplayed();
    }
    await verify(world, [second]);
    await expect($("button=Select mods")).toBeDisplayed();
    await closeApplication(world, runtime.processId);
  });
});
