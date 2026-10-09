import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { fingerprint, observeUntil } from "../support/observations";
import {
  deleteMod,
  expectOrderingDialog,
  expectShardStatus,
  findMod,
  modSwitch,
  openShardStatus,
  searchLibrary,
  setModEnabled,
} from "../support/shard-actions";
import { LIBRARY_MODS, SHARDS, shardModId } from "../support/shard-fixtures";
import {
  assertShardLayout,
  readGameinfoSearchPaths,
  searchPathsFor,
  shardPaths,
  type ShardExpectation,
} from "../support/shard-oracle";
import { navigate } from "../support/ui";
import { buildSyntheticVpk } from "../support/vpk";

const MOVED = shardModId(3);
const OVERFLOW = shardModId(99);
const LAST = shardModId(100);
const without = (...ids: string[]) =>
  LIBRARY_MODS.filter((id) => !ids.includes(id));

const FINAL: ShardExpectation = {
  loadOrder: without(LAST),
  shards: { [MOVED]: 1, [OVERFLOW]: 2 },
};
const ROGUE = `addons2/${SHARDS.folder}/pak09_dir.vpk`;
const rogueBytes = buildSyntheticVpk([
  { path: "scripts/rogue.txt", contents: "Copied in by hand\n" },
]);

const alertTitle = () => $("h3=Unrecognized mod files found");

const launchModded = (world: string, enabledMods: number) =>
  step("launch modded", async () => {
    const button = await $("button*=Launch modded");
    await expect(button).toHaveText(
      expect.stringContaining(`${enabledMods} mods`),
    );
    await button.waitForClickable();
    await button.click();
    await observeUntil(
      "Launch never wrote the overflow search path",
      () => readGameinfoSearchPaths(world),
      (paths) => paths.length === 2,
    );
  });

describe("addon shards in the library", () => {
  it("keeps more than 99 mods loadable through the UI and a restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "shards-checkpoint.json");

    if (process.env.DMM_E2E_PHASE === "overflow") {
      await assertShardLayout(world, "initial", {
        loadOrder: LIBRARY_MODS,
        shards: { [OVERFLOW]: 2, [LAST]: 2 },
        searchPaths: searchPathsFor(2),
      });
      await navigate("my-mods");
      await step("list every mod as enabled", async () => {
        await expect($("button*=Launch modded")).toHaveText(
          expect.stringContaining("101 mods"),
        );
        for (const modId of [shardModId(0), shardModId(98), OVERFLOW, LAST]) {
          await findMod(modId);
          await expect(modSwitch(modId)).toHaveAttribute(
            "aria-checked",
            "true",
          );
        }
      });

      await setModEnabled(world, LAST, false);
      await assertShardLayout(world, "overflow-partly-disabled", {
        loadOrder: without(LAST),
        disabled: [LAST],
        shards: { [OVERFLOW]: 2 },
      });
      await setModEnabled(world, OVERFLOW, false);
      await assertShardLayout(world, "overflow-emptied", {
        loadOrder: without(OVERFLOW, LAST),
        disabled: [OVERFLOW, LAST],
        searchPaths: searchPathsFor(2),
      });

      await openShardStatus();
      await expectShardStatus({
        shardsInUse: "1 / 10",
        gameinfo: "Out of sync",
      });
      await step("resync gameinfo.gi", async () => {
        await $("button*=Resync").click();
        await expectShardStatus({ shardsInUse: "1 / 10", gameinfo: "In sync" });
      });
      await assertShardLayout(world, "resynced", {
        loadOrder: without(OVERFLOW, LAST),
        disabled: [OVERFLOW, LAST],
        searchPaths: searchPathsFor(1),
      });

      await navigate("my-mods");
      await setModEnabled(world, OVERFLOW, true);
      await assertShardLayout(world, "overflow-refilled", {
        loadOrder: without(LAST),
        disabled: [LAST],
        shards: { [OVERFLOW]: 2 },
      });
      await setModEnabled(world, MOVED, false);
      // Enabling repacks the profile in load order, so the hole 003 left in
      // shard 1 pulls 099 back across the boundary.
      await setModEnabled(world, LAST, true);
      await assertShardLayout(world, "hole-closed", {
        loadOrder: without(MOVED),
        disabled: [MOVED],
        shards: { [OVERFLOW]: 1, [LAST]: 2 },
      });
      // 003 returns to its place and pushes 099 into shard 2 again.
      await setModEnabled(world, MOVED, true);
      await assertShardLayout(world, "reenabled-in-place", {
        loadOrder: LIBRARY_MODS,
        shards: { [MOVED]: 1, [OVERFLOW]: 2, [LAST]: 2 },
      });
      await expectOrderingDialog(LIBRARY_MODS);
      await expect(alertTitle()).not.toExist();
      await setModEnabled(world, LAST, false);

      await step("report a stray file in the overflow shard", async () => {
        // Shard 1 holds a managed pak09_dir.vpk; only the shard tells them apart.
        await writeFile(
          path.join((await shardPaths(world)).citadel, ROGUE),
          rogueBytes,
        );
        await navigate("settings");
        await navigate("my-mods");
        await alertTitle().waitForDisplayed();
        await $("button=Review files").click();
        const listed = await $$("li span.font-mono").map((item) =>
          item.getAttribute("title"),
        );
        assert.deepEqual(listed, ["addons2/pak09_dir.vpk"]);
      });
      await assertShardLayout(world, "stray-file", {
        ...FINAL,
        disabled: [LAST],
        unowned: { [ROGUE]: fingerprint(rogueBytes) },
      });
      await step("delete the stray file", async () => {
        await $('button[aria-label="Delete file"]').click();
        const confirm = await $('[role="alertdialog"]').$("button=Delete");
        await confirm.waitForClickable();
        await confirm.click();
        await expect(alertTitle()).not.toExist();
      });
      await assertShardLayout(world, "stray-deleted", {
        ...FINAL,
        disabled: [LAST],
      });

      await deleteMod(world, LAST);
      await assertShardLayout(world, "deleted", {
        ...FINAL,
        searchPaths: searchPathsFor(1),
      });
      await openShardStatus();
      await expectShardStatus({
        shardsInUse: "2 / 10",
        gameinfo: "Out of sync",
      });
      await launchModded(world, 100);
      await assertShardLayout(world, "launched", {
        ...FINAL,
        searchPaths: searchPathsFor(2),
      });
      await openShardStatus();
      await expectShardStatus({ shardsInUse: "2 / 10", gameinfo: "In sync" });
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else if (process.env.DMM_E2E_PHASE === "restart-overflow") {
      const prior = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, prior.processId);
      await assertShardLayout(world, "restarted", {
        ...FINAL,
        searchPaths: searchPathsFor(2),
      });
      await openShardStatus();
      await expectShardStatus({ shardsInUse: "2 / 10", gameinfo: "In sync" });
      await navigate("my-mods");
      await step("keep overflow mods enabled", async () => {
        await expect($("button*=Launch modded")).toHaveText(
          expect.stringContaining("100 mods"),
        );
        for (const modId of [OVERFLOW, MOVED]) {
          await findMod(modId);
          await expect(modSwitch(modId)).toHaveAttribute(
            "aria-checked",
            "true",
          );
        }
        await searchLibrary(LAST);
        await expect($(`[title="${LAST}"]`)).not.toExist();
        await expect(alertTitle()).not.toExist();
      });
      await expectOrderingDialog(FINAL.loadOrder);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "shards-restarted.png"),
      );
    } else throw new Error("Unknown shards phase");

    await closeApplication(world, runtime.processId);
    await assertShardLayout(world, `closed-${process.env.DMM_E2E_PHASE}`, {
      ...FINAL,
      searchPaths: searchPathsFor(2),
    });
  });
});
