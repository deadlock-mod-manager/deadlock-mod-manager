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
