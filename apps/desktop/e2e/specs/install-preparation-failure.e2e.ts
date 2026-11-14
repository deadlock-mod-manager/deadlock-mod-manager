import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { $, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  assertInstallPreparationFailed,
  PREPARATION_MOD,
  PREPARATION_NAME,
  readInstallPreparationFailureSnapshot,
} from "../support/install-failure-fixtures";
import { navigate } from "../support/ui";

describe("selected-file preparation failure", () => {
  it("reports the missing archive and never installs retained source VPKs", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    const enable = `[role="switch"][aria-label="Enable mod ${PREPARATION_NAME}"]`;
    await $(enable).waitForClickable();
    const before = await readInstallPreparationFailureSnapshot(world);
    assert.equal(before.state.localMods[0]?.remoteId, PREPARATION_MOD);
    assert.deepEqual(Object.keys(before.cache).sort(), [
      `${PREPARATION_MOD}/files/base.vpk`,
      `${PREPARATION_MOD}/files/effects.vpk`,
    ]);
    assert.deepEqual(Object.keys(before.addons), [".dmm.json"]);

    await step(
      "enable the mod with a stored multi-file selection but no archive",
      async () => {
        await $(enable).click();
        await expect($('[data-sonner-toast][data-type="error"]')).toHaveText(
          expect.stringContaining("Mod file not found at path"),
        );
        await expect(
          $('[data-sonner-toast][data-type="success"]'),
        ).not.toBeDisplayed();
        await expect($(enable)).toHaveAttribute("aria-checked", "false");
        await expect($('[role="dialog"]')).not.toBeDisplayed();
      },
    );
    const after = await readInstallPreparationFailureSnapshot(world);
    await writeFile(
      path.join(world, "artifacts", "install-preparation-failure.json"),
      JSON.stringify({ before, after }, null, 2),
    );
    assertInstallPreparationFailed(before, after);

    await closeApplication(world, runtime.processId);
    assertInstallPreparationFailed(
      before,
      await readInstallPreparationFailureSnapshot(world),
    );
  });
});
