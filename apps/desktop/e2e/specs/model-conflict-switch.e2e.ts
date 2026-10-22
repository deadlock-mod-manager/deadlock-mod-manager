import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  CONFLICTS,
  CONFLICT_MODS,
  HAT_JACKET,
  HAT_PANTS,
  conflictPayload,
} from "../support/conflict-fixtures";
import {
  fingerprint,
  observeUntil,
  readPersistedDocument,
} from "../support/observations";
import { navigate } from "../support/ui";
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
const verify = async (world: string, disabled: string) => {
  await observeUntil(
    "skin switch persisted",
    async () =>
      stateSchema.parse(await readPersistedDocument(world)).state.localMods,
    (mods) =>
      mods.length === 3 &&
      mods.every(
        (mod) =>
          mod.status ===
          (mod.remoteId === disabled ? "downloaded" : "installed"),
      ),
  );
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const directory = path.join(
    roots.game,
    "game",
    "citadel",
    "addons",
    CONFLICTS.folder,
  );
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
  );
  const inventory = await collectFileInventory(directory);
  for (const id of CONFLICT_MODS) {
    const entry = manifest.mods[id];
    assert.equal(entry.enabled, id !== disabled);
    for (const name of [...entry.currentVpks, ...entry.disabledVpks])
      assert.equal(inventory[name], fingerprint(conflictPayload(id)));
    assert.equal(entry.currentVpks.length, id === disabled ? 0 : 1);
  }
};
const MODEL_CONFLICT =
  '//*[@role="alertdialog"][.//*[normalize-space()="These mods replace the same model"]]';
// One query per lookup: a dialog that is still closing must not capture it.
// The bulk confirm also has a Cancel button, so scope ambiguous labels.
const choose = async (label: string, dialog = '//*[@role="alertdialog"]') => {
  await $(`${dialog}//button[normalize-space()="${label}"]`).click();
};

const replaced = () =>
  $(
    '//section[.//h3[normalize-space()="Replaced by another selected skin (1)"]]',
  );

describe("skin conflict activation", () => {
  it("keeps current on cancel and switches only the chosen skin across restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    if (process.env.DMM_E2E_PHASE === "switch") {
      await $(`[role="checkbox"][aria-label="Select ${HAT_PANTS}"]`).moveTo();
      await $(`[role="checkbox"][aria-label="Select ${HAT_PANTS}"]`).click();
      await $("button=Disable 1").click();
      await choose("Disable selected");
      await verify(world, HAT_PANTS);
      await $("button=Enable 1").waitForDisplayed();
      await $("button=Enable 1").click();
      await choose("Enable selected");
      await expect($(MODEL_CONFLICT)).toBeDisplayed();
      await choose("Cancel", MODEL_CONFLICT);
      await verify(world, HAT_PANTS);
      await expect($('[role="dialog"]')).toHaveText(
        expect.stringContaining("Skipped to keep current skins"),
      );
      await $('[role="dialog"]').$("button=Close").click();
      await $("button=Enable 1").click();
      await choose("Enable selected");
      await choose("Swap mods");
      await verify(world, HAT_JACKET);
      await $('[role="dialog"]').waitForDisplayed();
      await expect(replaced()).toBeDisplayed();
      await expect(replaced()).toHaveText(expect.stringContaining(HAT_JACKET));
      await expect(replaced()).not.toHaveText(
        expect.stringContaining(HAT_PANTS),
      );
      await $('[role="dialog"]').$("button=Close").click();
      // Also report a skin enabled and then replaced within this same batch.
      await $("button=Disable 1").click();
      await choose("Disable selected");
      await $(`[role="checkbox"][aria-label="Select ${HAT_JACKET}"]`).click();
      await $("button=Enable 2").click();
      await choose("Enable selected");
      await choose("Swap mods");
      await verify(world, HAT_JACKET);
      await expect(replaced()).toBeDisplayed();
      await expect(replaced()).toHaveText(expect.stringContaining(HAT_JACKET));
      await expect(replaced()).not.toHaveText(
        expect.stringContaining(HAT_PANTS),
      );
      await $('[role="dialog"]').$("button=Close").click();
    } else if (process.env.DMM_E2E_PHASE === "restart-switch") {
      await verify(world, HAT_JACKET);
    } else throw new Error("Unknown skin switch phase");
    await closeApplication(world, runtime.processId);
    await verify(world, HAT_JACKET);
  });
});
