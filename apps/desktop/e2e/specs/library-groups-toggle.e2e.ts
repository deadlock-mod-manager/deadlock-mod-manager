import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  createGroup,
  group,
  moveSelected,
  selectMods,
} from "../support/library-groups-actions";
import {
  assertLibraryGroupsDisk,
  readLibraryGroups,
} from "../support/library-groups-oracle";
import { observeUntil } from "../support/observations";
import { ALPHA_MODS } from "../support/profile-fixtures";
import { navigate } from "../support/ui";

const confirm = async (label: string) => {
  const dialog = $('[role="alertdialog"]');
  await dialog.waitForDisplayed();
  await dialog.$(`button=${label}`).click();
  await expect(dialog).not.toBeDisplayed();
};
const waitDisabled = (world: string, ids: string[]) =>
  observeUntil(
    "group mod statuses persisted",
    () => readLibraryGroups(world),
    (state) =>
      state.localMods.every(
        (mod) =>
          mod.status ===
          (ids.includes(mod.remoteId) ? "downloaded" : "installed"),
      ),
  );

describe("group enablement", () => {
  it("confirms group actions, counts enabled mods, and preserves other profiles and load order", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const [first, , third] = ALPHA_MODS;
    await navigate("my-mods");
    if (process.env.DMM_E2E_PHASE === "toggle") {
      await createGroup("Maps");
      await selectMods([first, third]);
      await moveSelected("Maps");
      await $('button[aria-label="Done selecting"]').click();
      await expect(group("Maps")).toHaveText(
        expect.stringContaining("2/2 enabled"),
      );
      await $('button[aria-label="Disable mods in Maps"]').click();
      await confirm("Cancel");
      await assertLibraryGroupsDisk(world, "toggle-cancel");
      await $('button[aria-label="Disable mods in Maps"]').click();
      await confirm("Disable selected");
      await waitDisabled(world, [first, third]);
      await assertLibraryGroupsDisk(world, "toggle-off", [first, third]);
      await $("#search").setValue("one");
      await $('button[aria-label="Enable mods in Maps"]').click();
      await confirm("Enable selected");
      const recap = $('[role="dialog"]');
      await expect(recap).toHaveText(
        expect.stringContaining("All 2 mods were enabled."),
      );
      await recap.$("button=Close").click();
      await waitDisabled(world, []);
      await assertLibraryGroupsDisk(world, "toggle-on");
      await $("#search").clearValue();
      await $('button[aria-label="Disable mods in Maps"]').click();
      await confirm("Disable selected");
    }
    await waitDisabled(world, [first, third]);
    await expect(group("Maps")).toHaveText(
      expect.stringContaining("0/2 enabled"),
    );
    await assertLibraryGroupsDisk(
      world,
      process.env.DMM_E2E_PHASE ?? "toggle",
      [first, third],
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", `${process.env.DMM_E2E_PHASE}.png`),
    );
    await closeApplication(world, runtime.processId);
  });
});
