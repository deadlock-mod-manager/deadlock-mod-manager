import assert from "node:assert/strict";
import { $ } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  REENABLE,
  REENABLED_MOD,
} from "../support/compatibility-fix-reenabled-fixtures";
import { step } from "../support/evidence";
import {
  badgeStatus,
  readFixChosen,
  readHealth,
  readRepairState,
  waitForStatus,
} from "../support/fixed-status";
import { observeUntil } from "../support/observations";
import { findMod, setModEnabled } from "../support/shard-actions";
import { navigate } from "../support/ui";

// What the library shows next to what a game started from Steam would load.
const observe = async (world: string) => {
  const state = await readRepairState(world, REENABLE.folder);
  return {
    fixChosen: await readFixChosen(world, REENABLE.folder, REENABLED_MOD),
    health: (await readHealth(REENABLE.folder))[REENABLED_MOD],
    packageExists: state.packageExists,
    repairedMods: state.repairedMods,
    mounted: state.mountedInGameinfo,
  };
};

// Enabling deletes the package; the background refresh rebuilds it.
const settle = async (world: string) => {
  await observeUntil(
    "repair rebuilt after enabling",
    () => observe(world),
    (state) =>
      state.health === "fixed" &&
      state.packageExists &&
      state.repairedMods.includes(REENABLED_MOD),
    60_000,
  );
  return {
    ...(await observe(world)),
    badge: await badgeStatus(REENABLED_MOD),
  };
};

describe("compatibility fix on a mod that comes back enabled", () => {
  it("mounts the repair once the fixed mod is enabled again", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await waitForStatus(REENABLE.folder, REENABLED_MOD, "fixable");
    await setModEnabled(world, REENABLED_MOD, false);

    const saved = await step("fix the disabled mod from its page", async () => {
      // The library banner leaves out disabled mods; their page offers Fix.
      await findMod(REENABLED_MOD);
      await $(`//*[@title="${REENABLED_MOD}"]`).click();
      const alert = await $('[data-testid="mod-health-alert"]');
      await alert.waitForDisplayed();
      const fix = await alert.$("button=Fix for this patch");
      await fix.waitForClickable();
      await fix.click();
      await waitForStatus(REENABLE.folder, REENABLED_MOD, "fixed");
      await navigate("my-mods");
      return observe(world);
    });

    const switched = await step("enable it with the switch", async () => {
      await setModEnabled(world, REENABLED_MOD, true);
      return settle(world);
    });

    assert.deepEqual(
      { saved, switched },
      {
        saved: {
          fixChosen: true,
          health: "fixed",
          packageExists: false,
          repairedMods: [],
          mounted: true,
        },
        switched: {
          fixChosen: true,
          health: "fixed",
          packageExists: true,
          repairedMods: [REENABLED_MOD],
          mounted: true,
          badge: "fixed",
        },
      },
    );

    await closeApplication(world, runtime.processId);
  });
});
