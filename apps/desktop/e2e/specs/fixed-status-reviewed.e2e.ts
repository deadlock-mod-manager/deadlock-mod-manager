import { $ } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  checkpoint,
  closeDialogs,
  expectStillFixed,
  fixAllInDialog,
  readHealth,
  readManifestEnabled,
  readRepairState,
  toggleMod,
  waitForStatus,
} from "../support/fixed-status";
import {
  FIXED_MOD,
  PLAIN_MOD,
  RIVAL_MOD,
  STATUS,
} from "../support/fixed-status-fixtures";
import { observeUntil } from "../support/observations";
import { navigate } from "../support/ui";

// Both mods end fixed with their repairs packaged and mounted. The first is
// sampled long enough for a library change's rebuild to settle.
const expectReviewedFixes = async (world: string, name: string) => {
  await expectStillFixed(world, STATUS.folder, FIXED_MOD, name, 15_000);
  await expectStillFixed(world, STATUS.folder, RIVAL_MOD, `${name}-rival`, 0);
};

const setPlainEnabled = async (world: string, enabled: boolean) => {
  await toggleMod(PLAIN_MOD);
  await observeUntil(
    `${PLAIN_MOD} ${enabled ? "enabled" : "disabled"}`,
    () => readManifestEnabled(world, STATUS.folder, PLAIN_MOD),
    (value) => value === enabled,
  );
};

// Two fixed mods that set the same game text need a review. Once the player
// applied it, a library change to another mod must not undo their fixes.
describe("fixed status after a compatibility review", () => {
  it("keeps reviewed fixes", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    if (process.env.DMM_E2E_PHASE === "review") {
      await step("fix both mods through the review", async () => {
        await waitForStatus(STATUS.folder, FIXED_MOD, "fixable");
        await waitForStatus(STATUS.folder, RIVAL_MOD, "fixable");
        await fixAllInDialog();
        const apply = await $("button=Apply fixes");
        await apply.waitForClickable({ timeout: 60_000 });
        await checkpoint("review-dialog", {
          health: await readHealth(STATUS.folder),
        });
        await apply.click();
        await observeUntil(
          "reviewed package written",
          () => readRepairState(world, STATUS.folder),
          (state) => state.receiptExists && state.packageExists,
          60_000,
        );
        await closeDialogs();
        await expectReviewedFixes(world, "reviewed");
      });
    } else {
      await step("the reviewed fixes survive a restart", () =>
        expectReviewedFixes(world, "after-restart"),
      );
      await step(
        "the reviewed fixes survive another mod's change",
        async () => {
          await setPlainEnabled(world, false);
          await expectReviewedFixes(world, "after-disable");
          await setPlainEnabled(world, true);
          await expectReviewedFixes(world, "after-enable");
        },
      );
    }

    await closeApplication(world, runtime.processId);
  });
});
