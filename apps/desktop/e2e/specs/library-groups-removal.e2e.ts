import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  createGroup,
  expectMembership,
  groupMenu,
  moveSelected,
  selectMods,
} from "../support/library-groups-actions";
import { GROUP_BETA_MODS } from "../support/library-groups-fixtures";
import {
  assertLibraryGroupsDisk,
  readLibraryGroups,
} from "../support/library-groups-oracle";
import { observeUntil } from "../support/observations";
import { ALPHA, ALPHA_MODS, BETA } from "../support/profile-fixtures";
import { activateProfile, navigate } from "../support/ui";

describe("group membership during deletion", () => {
  it("removes only the active profile's mod and never resurrects it through Undo", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const [first, second, third] = ALPHA_MODS;
    await navigate("my-mods");
    if (process.env.DMM_E2E_PHASE === "remove") {
      await createGroup("Original");
      await createGroup("Destination");
      await selectMods([first, third]);
      await moveSelected("Original");
      await moveSelected("Destination");
      await $('button[aria-label="Done selecting"]').click();
      await $(`[data-library-mod="${third}"]`)
        .$('button[aria-label="Remove mod"]')
        .click();
      await $('[role="alertdialog"]').$("button=Cancel").click();
      await expectMembership(world, {
        Original: [],
        Destination: [first, third],
      });
      await $(`[data-library-mod="${third}"]`)
        .$('button[aria-label="Remove mod"]')
        .click();
      await $('[role="alertdialog"]').$("button=Delete").click();
      await observeUntil(
        "deleted mod removed from active profile",
        () => readLibraryGroups(world),
        (state) => !state.localMods.some((mod) => mod.remoteId === third),
      );
      await $("button=Undo").click();
      await expectMembership(world, { Original: [first], Destination: [] });
      await groupMenu("Original", "Delete group");
      await expectMembership(world, { Destination: [] });
      await activateProfile(BETA.name);
      await expect($(`[data-library-mod="${third}"]`)).toBeDisplayed();
      await expectMembership(world, {}, BETA.id);
      await activateProfile(ALPHA.name);
    }
    await expectMembership(world, { Destination: [] });
    await browser.waitUntil(() =>
      $(`[data-library-mod="${first}"]`).isDisplayed(),
    );
    await expect($(`[data-library-mod="${third}"]`)).not.toExist();
    await assertLibraryGroupsDisk(
      world,
      process.env.DMM_E2E_PHASE ?? "remove",
      [],
      [
        { profile: ALPHA, modIds: [first, second] },
        { profile: BETA, modIds: GROUP_BETA_MODS },
      ],
    );
    await closeApplication(world, runtime.processId);
  });
});
