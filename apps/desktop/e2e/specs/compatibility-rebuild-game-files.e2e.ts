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

// Changes made while DMM is closed that make a saved repair stale, one case
// each, plus a control that changes nothing. The player chose Fix and changed
// no mods, so after the restart DMM should rebuild the repair by itself.
const CHANGES: Record<
  string,
  (world: string) => Promise<CheckpointData | void>
> = {
  "compatibility-rebuild-restart": async () => {},
  // A Steam verify or patch rewrites game files with their own bytes.
  "compatibility-rebuild-steam-rewrite": (world) =>
    rewriteGameFiles(world, ["steam.inf", "pak01_dir.vpk", TEXT_FILE]),
  // A game update: a new build number.
  "compatibility-rebuild-game-update": (world) =>
    bumpGameBuild(world, GAME_BUILD + 1),
  // An app update that bumps REPAIR_REVISION.
  "compatibility-rebuild-app-update": (world) =>
    ageRepairRevision(world, STATUS.folder),
};

describe("repair rebuild after game or app files change", () => {
  it("restores Fixed for this patch after the restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const caseId = runtime.caseId;
    const change = CHANGES[caseId];
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
    await closeApplication(world, runtime.processId);
  });
});
