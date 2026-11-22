import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  ageRepairRevision,
  bumpGameBuild,
  type CheckpointData,
  checkpoint,
  expectStillFixed,
  fixAndConfirm,
  readCheckpoint,
  readReceiptModifiedMs,
  readRepairState,
  rewriteGameFiles,
} from "../support/fixed-status";
import {
  FIXED_MOD,
  GAME_BUILD,
  STATUS,
  TEXT_FILE,
} from "../support/fixed-status-fixtures";
import { navigate } from "../support/ui";

const CHANGES = new Map<
  string,
  (world: string) => Promise<CheckpointData | void>
>([
  ["compatibility-rebuild-restart", async () => {}],
  [
    "compatibility-rebuild-steam-rewrite",
    (world) =>
      rewriteGameFiles(world, ["steam.inf", "pak01_dir.vpk", TEXT_FILE]),
  ],
  [
    "compatibility-rebuild-game-update",
    (world) => bumpGameBuild(world, GAME_BUILD + 1),
  ],
  [
    "compatibility-rebuild-app-update",
    (world) => ageRepairRevision(world, STATUS.folder),
  ],
]);

describe("repair rebuild after game or app files change", () => {
  it("restores Fixed for this patch after the restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const caseId = runtime.caseId;
    const change = CHANGES.get(caseId);
    if (!change) throw new Error(`No file change for ${caseId}`);
    await navigate("my-mods");

    if (process.env.DMM_E2E_PHASE === "fix") {
      await step("fix the mod", () =>
        fixAndConfirm(world, STATUS.folder, FIXED_MOD),
      );
      await closeApplication(world, runtime.processId);
      await step("change files while DMM is closed", async () => {
        const applied = await change(world);
        await checkpoint(
          "changed",
          {
            caseId,
            applied: applied ?? null,
            repairs: await readRepairState(world, STATUS.folder),
            receiptModifiedMs: await readReceiptModifiedMs(
              world,
              STATUS.folder,
            ),
          },
          { screenshot: false },
        );
      });
      return;
    }

    await step("the fix is back after the restart", () =>
      expectStillFixed(
        world,
        STATUS.folder,
        FIXED_MOD,
        "after-restart",
        60_000,
      ),
    );
    if (caseId === "compatibility-rebuild-restart") {
      await step("a current repair is reused, not rebuilt", async () => {
        const { receiptModifiedMs: before } = await readCheckpoint(
          "changed",
          z.object({ receiptModifiedMs: z.number() }),
        );
        const after = await readReceiptModifiedMs(world, STATUS.folder);
        if (after !== before)
          throw new Error(
            `the receipt was rewritten after the restart (${before} -> ${after})`,
          );
      });
    }
    await closeApplication(world, runtime.processId);
  });
});
