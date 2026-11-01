// Importing a share code whose mods the active profile already has leaves the
// active profile's mods installed and toggleable.
import { $, browser, expect } from "@wdio/globals";
import assert from "node:assert/strict";
import path from "node:path";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { importShareCode, readShareState } from "../support/profile-share";
import { SHARE_CODE, SHARE_MODS } from "../support/profile-share-fixtures";
import { activateProfile, navigate } from "../support/ui";

const installed = Object.fromEntries(
  SHARE_MODS.map((mod) => [mod.id, "installed"]),
);

const assertInstalled = (world: string, profileId: string, label: string) =>
  step(`the active profile's mods are installed (${label})`, async () => {
    const state = await readShareState(world);
    assert.equal(state.activeProfileId, profileId);
    assert.deepEqual(
      Object.fromEntries(
        state.localMods.map((mod) => [mod.remoteId, mod.status]),
      ),
      installed,
      `${label}: every mod of the active profile is installed`,
    );
    await expect($('[role="tab"][id$="-trigger-enabled"]')).toHaveText(
      expect.stringContaining(`(${SHARE_MODS.length})`),
    );
    for (const mod of SHARE_MODS)
      await expect(
        $(`[role="switch"][aria-label="Enable mod ${mod.name}"]`),
      ).toHaveAttribute("aria-checked", "true");
  });

describe("profile import overlapping the active profile", () => {
  it("leaves the active profile's mods installed", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    const first = await importShareCode(world, SHARE_CODE);
    await activateProfile(first.name);
    await browser.waitUntil(
      async () => (await readShareState(world)).activeProfileId === first.id,
      { timeoutMsg: "The imported profile never became active" },
    );
    await navigate("my-mods");
    await assertInstalled(world, first.id, "before the second import");

    // The second import downloads and extracts the same mods for a new profile.
    const second = await importShareCode(world, SHARE_CODE);
    await step("the second import installed its own mods", async () => {
      const state = await readShareState(world);
      assert.deepEqual(
        Object.fromEntries(
          (state.profiles[second.id]?.mods ?? []).map((mod) => [
            mod.remoteId,
            mod.status,
          ]),
        ),
        installed,
      );
    });
    await navigate("my-mods");
    await assertInstalled(world, first.id, "after the second import");
    // Nothing is running any more, so nothing should change.
    await browser.pause(5_000);
    await assertInstalled(world, first.id, "five seconds later");
    await browser.saveScreenshot(
      path.join(world, "artifacts", "import-overlap-after-second-import.png"),
    );
    await closeApplication(world, runtime.processId);
  });
});
