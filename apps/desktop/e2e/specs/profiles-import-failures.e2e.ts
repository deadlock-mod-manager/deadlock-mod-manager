import { $, browser } from "@wdio/globals";
import assert from "node:assert/strict";
import path from "node:path";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  FAILING_SHARE_CODE,
  IMPORTED_MOD,
  MISSING_MOD_ID,
  UNINSTALLABLE_MOD,
} from "../support/profile-import-failure-fixtures";
import {
  previewShareCode,
  readShareState,
  toastTexts,
} from "../support/profile-share";
import { navigate } from "../support/ui";

const resultDialog =
  '//*[@role="dialog"][.//*[normalize-space()="Import finished"]]';
const importingDialog =
  '//*[@role="dialog"][.//*[normalize-space()="Import Profile Preview"]]';
const manageProfiles =
  '//*[@role="dialog"][.//*[normalize-space()="Manage Profiles"]]';

describe("profile import with failed mods", () => {
  it("names the mods that weren't imported", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    const before = new Set(Object.keys((await readShareState(world)).profiles));

    await step(`import share code ${FAILING_SHARE_CODE}`, async () => {
      const create = await previewShareCode(FAILING_SHARE_CODE);
      // Wait, like a user, for the preview to finish its lookups; the missing
      // mod's failed lookup has its own error toast.
      await $(
        '//*[@role="dialog"]//*[normalize-space()="Mod not found or unavailable"]',
      ).waitForDisplayed({ timeout: 30_000 });
      await create.click();
    });

    await step("Escape doesn't close the dialog while it imports", async () => {
      await browser.pause(500);
      await browser.keys("Escape");
      await browser.pause(500);
      assert.ok(
        (await $(importingDialog).isExisting()) ||
          (await $(resultDialog).isExisting()),
        "the import dialog closed mid-import",
      );
    });

    const result = await step("the dialog shows the result", async () => {
      const dialog = $(resultDialog);
      await dialog.waitForDisplayed({ timeout: 60_000 });
      await browser.saveScreenshot(
        path.join(world, "artifacts", "import-failures-result.png"),
      );
      return dialog.getText();
    });

    await step("it names each failed mod and why", async () => {
      assert.match(result, /1 of 3 mods imported into/);
      assert.ok(result.includes(UNINSTALLABLE_MOD.name), result);
      assert.ok(result.includes("Download or install failed"), result);
      assert.ok(result.includes(`Mod ${MISSING_MOD_ID}`), result);
      assert.ok(result.includes("Could not get the mod's details"), result);
      assert.ok(!result.includes(IMPORTED_MOD.name), result);
      const toasts = await toastTexts();
      assert.ok(
        !toasts.some((text) => text.startsWith("warning:")),
        JSON.stringify(toasts),
      );
    });

    await step("only the importable mod was installed", async () => {
      const state = await readShareState(world);
      const created = Object.values(state.profiles).find(
        (profile) => !before.has(profile.id),
      );
      assert.deepEqual(
        created?.mods.map((mod) => [mod.remoteId, mod.status]),
        [[IMPORTED_MOD.id, "installed"]],
      );
    });

    await step("Done goes back to Manage Profiles", async () => {
      await $(`${resultDialog}//button[normalize-space()="Done"]`).click();
      await browser.waitUntil(
        async () => !(await $(resultDialog).isExisting()),
        {
          timeoutMsg: "The result stayed open",
        },
      );
      await $(manageProfiles).waitForDisplayed();
    });

    await closeApplication(world, runtime.processId);
  });
});
