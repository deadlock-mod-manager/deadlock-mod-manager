import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  checkpoint,
  expectStillFixed,
  fixAndConfirm,
  readManifestEnabled,
  readRepairState,
  toggleMod,
} from "../support/fixed-status";
import { FIXED_MOD, PLAIN_MOD, STATUS } from "../support/fixed-status-fixtures";
import { observeUntil } from "../support/observations";
import { navigate } from "../support/ui";

// A library change deletes the repair package at once, and the rebuild waits
// for a 1.5 s debounce in the window. Closing DMM inside that window used to
// leave the fixed mod without its repair until the next library change or
// modded launch.
describe("repair rebuild after closing DMM early", () => {
  it("restores the repair after the restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    if (process.env.DMM_E2E_PHASE === "toggle-close") {
      await step("fix the mod", () =>
        fixAndConfirm(world, STATUS.folder, FIXED_MOD),
      );
      const started = Date.now();
      await step("disable another mod", async () => {
        await toggleMod(PLAIN_MOD);
        await observeUntil(
          "disable written to the manifest",
          () => readManifestEnabled(world, STATUS.folder, PLAIN_MOD),
          (enabled) => enabled === false,
          5_000,
        );
      });
      const atClose = await readRepairState(world, STATUS.folder);
      const msFromToggleToClose = Date.now() - started;
      await closeApplication(world, runtime.processId);
      const afterClose = await readRepairState(world, STATUS.folder);
      await checkpoint(
        "at-close",
        { msFromToggleToClose, atClose, afterClose },
        { screenshot: false },
      );
      // Otherwise the restart has nothing to recover and the case proves nothing.
      if (atClose.packageExists || afterClose.packageExists)
        throw new Error(
          `the repair was rebuilt before DMM closed (${msFromToggleToClose} ms after the change)`,
        );
      return;
    }

    await step("the repair is back after the restart", () =>
      expectStillFixed(
        world,
        STATUS.folder,
        FIXED_MOD,
        "after-restart",
        30_000,
      ),
    );
    await closeApplication(world, runtime.processId);
  });
});
