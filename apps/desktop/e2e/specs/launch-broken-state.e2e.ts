import assert from "node:assert/strict";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { damageClosedWorld } from "../support/broken-state-fixtures";
import {
  assertDisabledBrokenLaunchState,
  assertEnabledBrokenPayloads,
  assertUntouchedBrokenNeighbours,
  captureBrokenState,
  hasMissingEnabledFiles,
  readBrokenLaunches,
  readBrokenState,
} from "../support/broken-state-oracle";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import { ALPHA, ALPHA_MODS } from "../support/profile-fixtures";
import { navigate } from "../support/ui";

describe("modded launch after external file changes", () => {
  it("checks missing VPKs and restores reverted gameinfo before recording a launch", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    assert(
      phase === "seed-launch" ||
        phase === "launch-damaged" ||
        phase === "restart-launch-damaged",
    );
    const missing = runtime.caseId === "missing-vpks-launch";
    await navigate("my-mods");
    if (phase === "seed-launch") {
      const seeded = await captureBrokenState(world, phase);
      assert.deepEqual(
        seeded.state.localMods.map((mod) => mod.remoteId),
        ALPHA_MODS,
      );
      assert.equal(hasMissingEnabledFiles(seeded), false);
      assertEnabledBrokenPayloads(seeded);
      await closeApplication(world, runtime.processId);
      const closed = await captureBrokenState(world, `closed-${phase}`);
      assert.deepEqual(closed.disk, seeded.disk);
      assert.deepEqual(closed.state.localMods, seeded.state.localMods);
      await damageClosedWorld(world, missing ? "vpks" : "gameinfo");
      const damaged = await captureBrokenState(world, "damage");
      if (missing) {
        assert.deepEqual(
          damaged.manifest,
          closed.manifest,
          "Only VPKs should be deleted",
        );
        assert.equal(
          Object.keys(damaged.disk).filter((file) => file.endsWith(".vpk"))
            .length,
          0,
        );
        assert.equal(hasMissingEnabledFiles(damaged), true);
      } else {
        assert.doesNotMatch(damaged.gameinfo, /Game\s+citadel\/addons/);
        assert.deepEqual(damaged.disk, closed.disk);
      }
      return;
    }
    if (missing && phase === "launch-damaged") {
      const detected = await observeUntil(
        "Missing files flagged for all three restorable mods",
        () => readBrokenState(world),
        (value) =>
          value.state.localMods.length === 3 &&
          (value.state.localMods.every((mod) => mod.missingVpks.length === 1) ||
            !hasMissingEnabledFiles(value)),
      );
      const warnings = detected.state.localMods.filter(
        (mod) => mod.missingVpks.length > 0,
      ).length;
      await browser.waitUntil(
        async () =>
          (await $$('[data-testid="missing-files-warning"]').length) ===
          warnings,
        {
          timeoutMsg:
            "My Mods must warn about each mod whose VPK is still missing",
        },
      );
    }
    const before = await captureBrokenState(
      world,
      `before-${phase}`,
      await $("main").getText(),
    );
    const count = before.launches.length;
    if (missing) {
      if (phase === "launch-damaged") {
        assert.equal(count, 0);
        await step(
          "Cancel the missing-files dialog without changing mods",
          async () => {
            await $("button*=Launch modded").click();
            const dialog = await $('[data-testid="launch-repair-dialog"]');
            await dialog.waitForDisplayed();
            const rows = await $$('[data-testid="launch-repair-mod"]');
            assert.equal(rows.length, ALPHA_MODS.length);
            for (const id of ALPHA_MODS) {
              const row = await $(
                `[data-testid="launch-repair-mod"][data-mod-id="${id}"]`,
              );
              assert.match(await row.getText(), new RegExp(id));
              assert.match(await row.getText(), /Local import/);
            }
            await browser.saveScreenshot(
              path.join(world, "artifacts", "repair-dialog.png"),
            );
            assert.equal((await readBrokenLaunches(world)).length, 0);
            await $('[data-testid="launch-repair-cancel"]').click();
            await dialog.waitForDisplayed({ reverse: true });
            const cancelled = await captureBrokenState(
              world,
              "cancelled-launch",
            );
            assert.equal(cancelled.launches.length, 0);
            assert.deepEqual(cancelled.disk, before.disk);
            assert.deepEqual(cancelled.manifest, before.manifest);
            assert.deepEqual(cancelled.state, before.state);
            assert.deepEqual(cancelled.modsStore, before.modsStore);
            assert.equal(cancelled.gameinfo, before.gameinfo);
          },
        );
        await step(
          "Disable affected mods and retry the original launch",
          async () => {
            await $("button*=Launch modded").click();
            const dialog = await $('[data-testid="launch-repair-dialog"]');
            await dialog.waitForDisplayed();
            await $('[data-testid="launch-repair-disable"]').click();
            await dialog.waitForDisplayed({ reverse: true });
            await observeUntil(
              "One launch with every affected mod disabled",
              () => readBrokenState(world),
              (value) =>
                value.launches.length === 1 &&
                value.state.localMods.every(
                  (mod) => mod.status === "downloaded",
                ),
            );
            const launched = await captureBrokenState(world, `after-${phase}`);
            assertDisabledBrokenLaunchState(launched);
            assert.deepEqual(launched.modsStore, before.modsStore);
            await assertUntouchedBrokenNeighbours(world, launched);
          },
        );
      } else {
        await step(
          "Restart preserves disabled mods and the recorded launch",
          async () => {
            assertDisabledBrokenLaunchState(before);
            await assertUntouchedBrokenNeighbours(world, before);
            assert.equal(
              await $('[data-testid="launch-repair-dialog"]').isExisting(),
              false,
            );
          },
        );
      }
    } else {
      await step("Launch modded restores reverted gameinfo", async () => {
        const button = await $("button*=Launch modded");
        await button.waitForClickable();
        await button.click();
        await observeUntil(
          "One additional modded launch",
          () => readBrokenLaunches(world),
          (launches) => launches.length === count + 1,
        );
        const launched = await captureBrokenState(
          world,
          `after-${phase}`,
          await $("body").getText(),
        );
        assert.equal(launched.launches.length, count + 1);
        assertEnabledBrokenPayloads(launched);
        assert.match(
          launched.gameinfo,
          new RegExp(`Game\\s+citadel/addons/${ALPHA.folder}`),
        );
        assert.match(
          launched.launches.at(-1)?.uri ?? "",
          /^steam:\/\/run\/1422450\//,
        );
        assert.deepEqual(launched.disk, before.disk);
        assert.deepEqual(launched.modsStore, before.modsStore);
        await assertUntouchedBrokenNeighbours(world, launched);
      });
    }
    if (missing) {
      const switches = await $$('main [role="switch"]');
      assert.equal(switches.length, ALPHA_MODS.length);
      for (const toggle of switches)
        await expect(toggle).toHaveAttribute("aria-checked", "false");
    }
    const final = await captureBrokenState(world, `final-${phase}`);
    await closeApplication(world, runtime.processId);
    const closed = await captureBrokenState(world, `closed-${phase}`);
    assert.deepEqual(closed.disk, final.disk);
    assert.deepEqual(closed.manifest, final.manifest);
    assert.deepEqual(closed.state.localMods, final.state.localMods);
    assert.deepEqual(closed.state.profiles, final.state.profiles);
    await assertUntouchedBrokenNeighbours(world, closed);
    if (missing) assertDisabledBrokenLaunchState(closed);
  });
});
