import {
  createGroup,
  expectMembership,
  moveSelected,
  selectMods,
} from "../support/library-groups-actions";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  CONFLICTS,
  CONFLICT_MODS,
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
    bisectSession: z
      .object({ stage: z.string(), originalEnabled: z.array(z.string()) })
      .nullable(),
    localMods: z.array(z.object({ remoteId: z.string(), status: z.string() })),
    profiles: z.record(
      z.string(),
      z.object({
        enabledMods: z.record(z.string(), z.object({ enabled: z.boolean() })),
      }),
    ),
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
const verify = async (world: string, restored: boolean) => {
  await observeUntil(
    "bisect state saved",
    async () => stateSchema.parse(await readPersistedDocument(world)).state,
    (state) =>
      (restored
        ? state.bisectSession === null
        : state.bisectSession?.stage === "ready") &&
      state.localMods.length === 3 &&
      state.localMods.every(
        (mod) =>
          mod.status === (restored ? "installed" : "downloaded") &&
          (state.profiles[CONFLICTS.id].enabledMods[mod.remoteId]?.enabled ??
            false) === restored,
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
  for (const [index, id] of CONFLICT_MODS.entries()) {
    const entry = manifest.mods[id];
    assert.equal(entry.enabled, restored);
    for (const name of [...entry.currentVpks, ...entry.disabledVpks])
      assert.equal(inventory[name], fingerprint(conflictPayload(id)));
    assert.equal(entry.currentVpks.length, restored ? 1 : 0);
    if (restored)
      assert.deepEqual(entry.currentVpks, [`pak0${index + 1}_dir.vpk`]);
  }
};
const start = async (world: string, first: boolean) => {
  await $('button[aria-label="More actions"]').click();
  await browser.keys("ArrowDown");
  await $(
    '//*[@role="menuitem" and normalize-space()="Find a broken mod"]',
  ).click();
  if (first) {
    await $('[role="dialog"]').$("button=Skip").click();
  }
  await $('[role="dialog"]').$("button=Start").click();
  await verify(world, false);
  await expect($("button=Groups")).toBeDisabled();
  await expect($('button[aria-label="Enable mods in Outfits"]')).toBeDisabled();
  const state = stateSchema.parse(await readPersistedDocument(world)).state;
  assert.deepEqual(state.bisectSession?.originalEnabled, CONFLICT_MODS);
};
const restore = async (world: string) => {
  await $("button=Stop").click();
  await $('[role="alertdialog"]').$("button=Stop and restore").click();
  await verify(world, true);
  await expect($("button=Stop")).not.toBeDisplayed();
};

describe("bisection of pre-existing skin conflicts", () => {
  it("restores both skins, their bytes and original order, including after restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    if (process.env.DMM_E2E_PHASE === "bisect") {
      await createGroup("Outfits");
      await selectMods(CONFLICT_MODS);
      await moveSelected("Outfits");
      await $('button[aria-label="Done selecting"]').click();
      await start(world, true);
      await restore(world);
      await start(world, false);
      await expectMembership(world, { Outfits: CONFLICT_MODS }, CONFLICTS.id);
      await closeApplication(world, runtime.processId);
      await verify(world, false);
    } else {
      await verify(world, false);
      await restore(world);
      await expectMembership(world, { Outfits: CONFLICT_MODS }, CONFLICTS.id);
      await closeApplication(world, runtime.processId);
      await verify(world, true);
    }
  });
});
