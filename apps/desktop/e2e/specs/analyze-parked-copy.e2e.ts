import assert from "node:assert/strict";
import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { PARKED, PARKED_MOD } from "../support/analyze-parked-copy-fixtures";
import { step } from "../support/evidence";
import { filesystemManifestSchema } from "../support/filesystem-oracle";
import {
  badgeStatus,
  fixAllInDialog,
  readHealth,
  readRepairState,
  waitForStatus,
} from "../support/fixed-status";
import { observeUntil } from "../support/observations";
import { setModEnabled } from "../support/shard-actions";
import { navigate, waitForOverlaysClosed } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const profileDirectory = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return path.join(roots.game, "game", "citadel", "addons", PARKED.folder);
};

const readEntry = async (world: string) =>
  filesystemManifestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(await profileDirectory(world), ".dmm.json"),
        "utf8",
      ),
    ),
  ).mods[PARKED_MOD];

const observe = async (world: string) => {
  const repairs = await readRepairState(world, PARKED.folder);
  return {
    health: (await readHealth(PARKED.folder))[PARKED_MOD],
    packageExists: repairs.packageExists,
    repairedMods: repairs.repairedMods,
  };
};

describe("Analyze with a disabled mod's parked copy in addons", () => {
  it("records only the file the game loads, so the repair rebuilds", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await step("fix the mod", async () => {
      await waitForStatus(PARKED.folder, PARKED_MOD, "fixable");
      await fixAllInDialog();
      await waitForStatus(PARKED.folder, PARKED_MOD, "fixed");
      await browser.keys("Escape");
      await waitForOverlaysClosed();
    });
    await setModEnabled(world, PARKED_MOD, false);

    await step("put a fresh copy of the mod in addons by hand", async () => {
      const directory = await profileDirectory(world);
      const [parked] = (await readEntry(world)).disabledVpks;
      await copyFile(
        path.join(directory, parked),
        path.join(directory, "pak01_dir.vpk"),
      );
    });

    const analyzed = await step("Analyze identifies the copy", async () => {
      await navigate("my-mods");
      await waitForOverlaysClosed();
      await $('button[aria-label="More actions"]').click();
      await browser.keys("ArrowDown");
      await $('[role="menuitem"]=Analyze Local Addons').click();
      await observeUntil(
        "Analyze enabled the mod",
        () => readEntry(world),
        (entry) => entry.enabled,
      );
      // The background refresh rebuilds the repair for the enabled mod.
      await observeUntil(
        "repair rebuilt after Analyze",
        () => observe(world),
        (state) => state.health === "fixed" && state.packageExists,
        60_000,
      ).catch(() => null);
      const { enabled, currentVpks } = await readEntry(world);
      return {
        enabled,
        currentVpks,
        ...(await observe(world)),
        badge: await badgeStatus(PARKED_MOD),
      };
    });

    assert.deepEqual(analyzed, {
      enabled: true,
      currentVpks: ["pak01_dir.vpk"],
      health: "fixed",
      packageExists: true,
      repairedMods: [PARKED_MOD],
      badge: "fixed",
    });

    await closeApplication(world, runtime.processId);
  });
});
