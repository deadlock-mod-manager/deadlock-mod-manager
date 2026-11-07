import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  badgeStatus,
  checkpoint,
  fixAndConfirm,
  readHealth,
  readRepairState,
  waitForStatus,
} from "../support/fixed-status";
import { FIXED_MOD, RIVAL_MOD, STATUS } from "../support/fixed-status-fixtures";
import { observeUntil } from "../support/observations";
import { findMod, setModEnabled } from "../support/shard-actions";
import { navigate } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

// An unfixed mod that ships the same text file as a fixed one keeps that file
// as shipped, so the fixed mod's repair is left out of the package. Its status
// must then stop claiming anything: not "fixed", and not "works" either.

const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.looseObject({ compatibilityEnabled: z.boolean().optional() }),
  ),
});

/** Whether the player's Fix choice for `modId` is still saved. */
const fixChosen = async (world: string, modId: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const raw = await readFile(
    path.join(
      roots.game,
      "game",
      "citadel",
      "addons",
      STATUS.folder,
      ".dmm.json",
    ),
    "utf8",
  );
  return (
    manifestSchema.parse(JSON.parse(raw)).mods[modId]?.compatibilityEnabled ??
    false
  );
};

const OUTDATED_ALERT = `//*[@role="alert"][contains(., "hasn't been updated since")]`;

type ModPage = { healthAlert: string | null; outdatedWarning: boolean };

/**
 * Opens the mod's own page and waits for its health alert and date warning to
 * match `expected`, returning what it last showed either way.
 */
const modPage = async (modId: string, expected: ModPage) => {
  await navigate("my-mods");
  await findMod(modId);
  const title = await $(`//*[@title="${modId}"]`);
  await title.waitForClickable();
  await title.click();
  await expect(browser).toHaveUrl(expect.stringContaining(`/mods/${modId}`));
  let shown: ModPage = { healthAlert: null, outdatedWarning: false };
  await browser
    .waitUntil(
      async () => {
        const alert = await $('[data-testid="mod-health-alert"]');
        shown = {
          healthAlert: (await alert.isExisting())
            ? await alert.getAttribute("data-status")
            : null,
          outdatedWarning: await $(OUTDATED_ALERT).isExisting(),
        };
        return (
          shown.healthAlert === expected.healthAlert &&
          shown.outdatedWarning === expected.outdatedWarning
        );
      },
      { timeout: 10_000 },
    )
    .catch(() => false);
  return shown;
};

describe("fixed status beside an unfixed mod sharing its file", () => {
  it("stops calling the mod fixed or working while its repair is left out", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await setModEnabled(world, RIVAL_MOD, false);
    await step("fix the mod", () =>
      fixAndConfirm(world, STATUS.folder, FIXED_MOD),
    );

    await setModEnabled(world, RIVAL_MOD, true);
    await step("enable the unfixed mod sharing its file", async () => {
      // The rebuild keeps the shared file as shipped, so the package loses
      // the fixed mod's repair. That protection is intended.
      const repairs = await observeUntil(
        "repair package rebuilt without the fixed mod",
        () => readRepairState(world, STATUS.folder),
        (state) =>
          state.receiptExists && !state.repairedMods.includes(FIXED_MOD),
        30_000,
      );
      const health = await readHealth(STATUS.folder);
      const chosen = await fixChosen(world, FIXED_MOD);
      const badge = await badgeStatus(FIXED_MOD);
      const page = await modPage(FIXED_MOD, {
        healthAlert: null,
        outdatedWarning: true,
      });
      await checkpoint("rival-enabled", {
        health,
        repairs,
        fixChosen: chosen,
        badge,
        ...page,
      });
      if (health[FIXED_MOD] !== "notCovered")
        throw new Error(
          `${FIXED_MOD} must not claim a verdict while its repair is left out, but reads ${health[FIXED_MOD]}`,
        );
      if (health[RIVAL_MOD] !== "fixable")
        throw new Error(
          `${RIVAL_MOD} should still offer its fix, but reads ${health[RIVAL_MOD]}`,
        );
      if (!chosen) throw new Error(`${FIXED_MOD}'s Fix choice must stay saved`);
      if (badge !== null)
        throw new Error(`${FIXED_MOD}'s card must not show a health badge`);
      if (page.healthAlert !== null || !page.outdatedWarning)
        throw new Error(
          `${FIXED_MOD}'s page must fall back to the outdated warning: ${JSON.stringify(page)}`,
        );
    });

    await navigate("my-mods");
    await setModEnabled(world, RIVAL_MOD, false);
    await step("disable the unfixed mod again", async () => {
      await waitForStatus(STATUS.folder, FIXED_MOD, "fixed", 30_000);
      const repairs = await observeUntil(
        "fixed mod's repair packaged again",
        () => readRepairState(world, STATUS.folder),
        (state) =>
          state.repairedMods.includes(FIXED_MOD) && state.packageExists,
        30_000,
      );
      const badge = await badgeStatus(FIXED_MOD);
      const page = await modPage(FIXED_MOD, {
        healthAlert: "fixed",
        outdatedWarning: false,
      });
      await checkpoint("rival-disabled", {
        health: await readHealth(STATUS.folder),
        repairs,
        badge,
        ...page,
      });
      if (badge !== "fixed")
        throw new Error(`${FIXED_MOD}'s card must read fixed again: ${badge}`);
      if (page.healthAlert !== "fixed" || page.outdatedWarning)
        throw new Error(
          `${FIXED_MOD}'s page must show it fixed again: ${JSON.stringify(page)}`,
        );
    });

    await closeApplication(world, runtime.processId);
  });
});
