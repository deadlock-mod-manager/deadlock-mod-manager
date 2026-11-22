import { $, $$, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { expectOrderingDialog } from "../support/shard-actions";
import {
  CONFLICT_MODS,
  OVERFLOW_CHALLENGER,
  SHARD_ONE_WINNER,
} from "../support/shard-fixtures";
import {
  assertShardLayout,
  searchPathsFor,
  type ShardExpectation,
} from "../support/shard-oracle";
import { navigate } from "../support/ui";

const INITIAL: ShardExpectation = {
  loadOrder: CONFLICT_MODS,
  shards: { [SHARD_ONE_WINNER]: 1, [OVERFLOW_CHALLENGER]: 2 },
  searchPaths: searchPathsFor(2),
};
// Loading the overflow mod first pulls it into shard 1 and pushes the mod that
// was 99th across the boundary.
const PROMOTED: ShardExpectation = {
  loadOrder: [
    OVERFLOW_CHALLENGER,
    ...CONFLICT_MODS.filter((id) => id !== OVERFLOW_CHALLENGER),
  ],
  shards: {
    [OVERFLOW_CHALLENGER]: 1,
    [SHARD_ONE_WINNER]: 1,
    [CONFLICT_MODS[98]]: 2,
  },
  searchPaths: searchPathsFor(2),
};

const readGroups = () =>
  $$('[data-testid="conflict-group"]').map(async (row) => ({
    providers: (await row.getAttribute("data-providers")) ?? "",
    severity: (await row.getAttribute("data-severity")) ?? "",
  }));

/** Providers are listed in load order, so the first one is used in game. */
const expectWinner = (first: string, second: string) =>
  browser.waitUntil(
    async () =>
      JSON.stringify(await readGroups()) ===
      JSON.stringify([
        { providers: `${first},${second}`, severity: "critical" },
      ]),
    { timeoutMsg: `${first} never loaded ahead of ${second}` },
  );

const openConflictsTab = () =>
  step("open conflicts tab", async () => {
    const tab = await $(
      '//*[@role="tab" and contains(normalize-space(), "Conflicts")]',
    );
    await tab.waitForClickable();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  });

describe("conflicts across addon shards", () => {
  it("lets an overflow mod win a conflict and persists the move", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    if (process.env.DMM_E2E_PHASE === "cross-shard") {
      await assertShardLayout(world, "initial", INITIAL);
      await step("badge only the two conflicting mods", async () => {
        // Both ship pak01_dir.vpk, in different shards; the rest never conflict.
        await browser.waitUntil(
          async () =>
            (await $$('[data-testid="mod-conflict-badge"]').length) === 2,
          { timeoutMsg: "Exactly the two conflicting mods should be badged" },
        );
      });
      await openConflictsTab();
      await expectWinner(SHARD_ONE_WINNER, OVERFLOW_CHALLENGER);

      await step("load the overflow mod first", async () => {
        await $(
          `[data-testid="conflict-provider"][data-mod-id="${OVERFLOW_CHALLENGER}"]`,
        )
          .$("button=Load first")
          .click();
        await expectWinner(OVERFLOW_CHALLENGER, SHARD_ONE_WINNER);
      });
      await assertShardLayout(world, "promoted", PROMOTED);
      await expectOrderingDialog(PROMOTED.loadOrder);
    } else if (process.env.DMM_E2E_PHASE === "restart-cross-shard") {
      await assertShardLayout(world, "restarted", PROMOTED);
      await openConflictsTab();
      await expectWinner(OVERFLOW_CHALLENGER, SHARD_ONE_WINNER);
      await expectOrderingDialog(PROMOTED.loadOrder);
    } else throw new Error("Unknown cross-shard conflict phase");

    await closeApplication(world, runtime.processId);
    await assertShardLayout(
      world,
      `closed-${process.env.DMM_E2E_PHASE}`,
      PROMOTED,
    );
  });
});
