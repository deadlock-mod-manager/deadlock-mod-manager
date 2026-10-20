import assert from "node:assert/strict";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  createGroup,
  expectMembership,
  groupMenu,
  groupToggle,
  groupTools,
  moveSelected,
  selectMods,
} from "../support/library-groups-actions";
import {
  assertLibraryGroupsDisk,
  readLibraryGroups,
} from "../support/library-groups-oracle";
import { ALPHA, ALPHA_MODS, BETA } from "../support/profile-fixtures";
import { activateProfile, navigate } from "../support/ui";

const rename = async (from: string, to: string) => {
  await groupMenu(from, "Rename group");
  await $('input[placeholder="e.g. Map cosmetics"]').setValue(to);
  await $("button=Save").click();
};

describe("profile group organization", () => {
  it("copies matching memberships independently and remembers collapsed groups", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const [first, second, third] = ALPHA_MODS;
    await navigate("my-mods");
    if (process.env.DMM_E2E_PHASE === "organize") {
      await activateProfile(BETA.name);
      await createGroup("Old folder");
      await activateProfile(ALPHA.name);
      await createGroup("Silver");
      await createGroup("Maps");
      await selectMods([first, second]);
      await moveSelected("Silver");
      await selectMods([third]);
      await moveSelected("Maps");
      await $('button[aria-label="Done selecting"]').click();
      await rename("Silver", "Characters");
      await groupTools("Collapse all groups");
      for (const name of ["Characters", "Maps"])
        await expect(groupToggle(name)).toHaveAttribute(
          "aria-expanded",
          "false",
        );
      await groupTools("Expand all groups");
      for (const name of ["Characters", "Maps"])
        await expect(groupToggle(name)).toHaveAttribute(
          "aria-expanded",
          "true",
        );
      await groupTools("Copy organization to profile");
      await $('[role="combobox"][aria-label="Destination profile"]').click();
      await $(`[role="option"]=${BETA.name}`).click();
      await $('[role="dialog"]').$("button=Cancel").click();
      await expectMembership(world, { "Old folder": [] }, BETA.id);
      await groupTools("Copy organization to profile");
      await $('[role="dialog"]').$("button=Copy organization").click();
      await expectMembership(
        world,
        { Characters: [first], Maps: [third] },
        BETA.id,
      );
      const state = await readLibraryGroups(world);
      assert.notEqual(
        state.profiles[ALPHA.id].modGroups[0].id,
        state.profiles[BETA.id].modGroups[0].id,
      );
      await activateProfile(BETA.name);
      await rename("Characters", "Beta Characters");
      await groupTools("Collapse all groups");
      await activateProfile(ALPHA.name);
    }
    await expectMembership(world, {
      Characters: [first, second],
      Maps: [third],
    });
    await expectMembership(
      world,
      { "Beta Characters": [first], Maps: [third] },
      BETA.id,
    );
    await expect(groupToggle("Characters")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await activateProfile(BETA.name);
    await expect(groupToggle("Beta Characters")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await activateProfile(ALPHA.name);
    await assertLibraryGroupsDisk(
      world,
      process.env.DMM_E2E_PHASE ?? "organize",
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", `${process.env.DMM_E2E_PHASE}.png`),
    );
    await closeApplication(world, runtime.processId);
  });
});
