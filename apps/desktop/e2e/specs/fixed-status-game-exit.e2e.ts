import assert from "node:assert/strict";
import { $ } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { startFakeGame, stopFakeGame } from "../support/fake-game";
import {
  checkpoint,
  expectStillFixed,
  fixAndConfirm,
  readHealth,
  readRepairState,
  sampleStatus,
  waitForStatus,
} from "../support/fixed-status";
import { FIXED_MOD, PLAIN_MOD, STATUS } from "../support/fixed-status-fixtures";
import { setModEnabled } from "../support/shard-actions";
import { navigate } from "../support/ui";

describe("fixed status after a change made while the game runs", () => {
  it("rebuilds the repair once the game exits", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await step("fix the mod", () =>
      fixAndConfirm(world, STATUS.folder, FIXED_MOD),
    );

    const game = await startFakeGame(world);
    try {
      await setModEnabled(world, PLAIN_MOD, false);
      await setModEnabled(world, PLAIN_MOD, true);
      await step("while the game runs", async () => {
        await waitForStatus(STATUS.folder, FIXED_MOD, "fixable", 15_000);
        await $('[data-testid="mod-health-banner"]')
          .$("p=Close Deadlock to fix mods.")
          .waitForDisplayed({ timeout: 15_000 });
        const samples = await sampleStatus(
          "while the game runs",
          STATUS.folder,
          FIXED_MOD,
          5_000,
        );
        const repairs = await readRepairState(world, STATUS.folder);
        await checkpoint("game-running", {
          health: await readHealth(STATUS.folder),
          repairs,
          samples,
        });
        assert.equal(samples.at(-1)?.status, "fixable");
        assert.ok(!repairs.packageExists && !repairs.receiptExists);
      });
    } finally {
      await stopFakeGame(game);
    }

    await step("after the game exits", async () => {
      const { repairs } = await expectStillFixed(
        world,
        STATUS.folder,
        FIXED_MOD,
        "game-exited",
        20_000,
      );
      assert.deepEqual(repairs.repairedMods, [FIXED_MOD]);
    });

    await closeApplication(world, runtime.processId);
  });
});
