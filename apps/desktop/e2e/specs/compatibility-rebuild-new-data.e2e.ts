import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  expectStillFixed,
  fixAndConfirm,
  importMod,
  readRepairState,
} from "../support/fixed-status";
import {
  DATA_MOD_FILE,
  FIXED_MOD,
  STATUS,
} from "../support/fixed-status-fixtures";
import { navigate } from "../support/ui";

// The repair receipt's key digests the install-wide observed game data. A
// health check of a new mod that ships a game data table learns and saves new
// data after the fixed mod's repair was built, so that repair goes stale.
describe("repair rebuild after a health check learns game data", () => {
  it("keeps Fixed for this patch", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    if (process.env.DMM_E2E_PHASE === "install") {
      await step("fix the mod", () =>
        fixAndConfirm(world, STATUS.folder, FIXED_MOD),
      );
      const before = await readRepairState(world, STATUS.folder);
      await step("install a mod that ships a game data table", () =>
        importMod(world, DATA_MOD_FILE, true),
      );
      await step("the fix survives the install", async () => {
        const { repairs } = await expectStillFixed(
          world,
          STATUS.folder,
          FIXED_MOD,
          "after-install",
          30_000,
          async () => ({ receiptHistoryBefore: before.historyDigest }),
        );
        // The repair must be rebuilt against the game data the check learned.
        if (
          repairs.historyDigest === null ||
          repairs.historyDigest === before.historyDigest
        )
          throw new Error(
            `the receipt doesn't reflect newly learned game data: ${before.historyDigest} -> ${repairs.historyDigest}`,
          );
      });
    } else {
      await step("the fix survives a restart after the install", () =>
        expectStillFixed(
          world,
          STATUS.folder,
          FIXED_MOD,
          "after-restart",
          30_000,
        ),
      );
    }

    await closeApplication(world, runtime.processId);
  });
});
