// A profile import that can't install every mod says which ones failed.
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
  waitForImportEnd,
} from "../support/profile-share";
import { navigate } from "../support/ui";

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
      await waitForImportEnd();
    });

    const completion = await step("the import reports its result", async () => {
      let found: string | undefined;
      await browser.waitUntil(
        async () => {
          found = (await toastTexts()).find(
            (text) =>
              text.startsWith("warning:") && text.includes("mods imported"),
          );
          return found !== undefined;
        },
        { timeout: 10_000, timeoutMsg: "No partial-import warning" },
      );
      // Let the toast finish sliding in before the screenshot.
      await browser.pause(1_000);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "import-failures-toast.png"),
      );
      return found ?? "";
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

    await step("the warning names each failed mod", async () => {
      assert.ok(completion.includes("1/3 mods imported"), completion);
      assert.ok(completion.includes(UNINSTALLABLE_MOD.name), completion);
      assert.ok(completion.includes(MISSING_MOD_ID), completion);
      assert.ok(!completion.includes(IMPORTED_MOD.name), completion);
    });

    await closeApplication(world, runtime.processId);
  });
});
