import assert from "node:assert/strict";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  type BrokenState,
  captureBrokenState,
  readBrokenState,
} from "../support/broken-state-oracle";
import { step } from "../support/evidence";
import {
  REPAIRABLE,
  REPAIR_MODS,
  repairPayload,
  UNREPAIRABLE,
} from "../support/launch-repair-fixtures";
import { fingerprint, observeUntil } from "../support/observations";
import { ALPHA } from "../support/profile-fixtures";
import { navigate } from "../support/ui";

const row = (id: string) =>
  $(`[data-testid="launch-repair-mod"][data-mod-id="${id}"]`);

/**
 * The reinstalled mod is enabled in the manifest, the store and the profile,
 * and its one VPK holds its own bytes; the unrepaired mod is enabled nowhere.
 */
const repairedOnly = (observed: BrokenState) => {
  const repaired = observed.manifest?.mods[REPAIRABLE.id];
  const local = observed.state.localMods.find(
    (mod) => mod.remoteId === REPAIRABLE.id,
  );
  const profile = observed.state.profiles[ALPHA.id];
  return (
    repaired?.enabled === true &&
    repaired.currentVpks.length === 1 &&
    observed.disk[repaired.currentVpks[0]] ===
      fingerprint(repairPayload(REPAIRABLE.id)) &&
    local?.status === "installed" &&
    profile.enabledMods[REPAIRABLE.id]?.enabled === true &&
    observed.manifest?.mods[UNREPAIRABLE.id]?.enabled !== true &&
    profile.enabledMods[UNREPAIRABLE.id]?.enabled !== true
  );
};

const assertRepairedOnly = (observed: BrokenState, label: string) => {
  assert.ok(
    repairedOnly(observed),
    `${label}: only ${UNREPAIRABLE.id} may be disabled; observed ${JSON.stringify(
      {
        manifest: observed.manifest,
        disk: observed.disk,
        localMods: observed.state.localMods,
        enabledMods: observed.state.profiles[ALPHA.id].enabledMods,
      },
    )}`,
  );
};

describe("launch repair after a partial reinstall", () => {
  it("disables only the mod that could not be reinstalled", async () => {
    const phase = z
      .enum(["repair-partial", "restart-repair-partial"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    if (phase === "restart-repair-partial") {
      await step("Restart keeps the repaired mod enabled", async () => {
        const restarted = await captureBrokenState(world, "restarted");
        assertRepairedOnly(restarted, "restarted");
        assert.equal(restarted.launches.length, 1);
        assert.equal(
          await $('[data-testid="launch-repair-dialog"]').isExisting(),
          false,
        );
      });
      await closeApplication(world, runtime.processId);
      return;
    }

    await observeUntil(
      "Both mods flagged as missing files",
      () => readBrokenState(world),
      (value) =>
        REPAIR_MODS.every(
          (mod) =>
            value.state.localMods.find((item) => item.remoteId === mod.id)
              ?.missingVpks.length === 1,
        ),
    );
    const dialog = await $('[data-testid="launch-repair-dialog"]');

    await step("Reinstall restores one mod and fails the other", async () => {
      await $("button*=Launch modded").click();
      await dialog.waitForDisplayed();
      assert.equal(
        await $$('[data-testid="launch-repair-mod"]').length,
        REPAIR_MODS.length,
      );
      await $('[data-testid="launch-repair-reinstall"]').click();
      await expect(dialog).toHaveText(
        expect.stringContaining("Some mods could not be repaired"),
        { wait: 60_000 },
      );
      // A failed row adds its error under the name; a repaired one shows none.
      assert.notEqual(
        (await (await row(UNREPAIRABLE.id)).getText()).trim(),
        UNREPAIRABLE.name,
      );
      assert.equal(
        (await (await row(REPAIRABLE.id)).getText()).trim(),
        REPAIRABLE.name,
      );
      await browser.saveScreenshot(
        path.join(world, "artifacts", "repair-partial.png"),
      );
      const partial = await captureBrokenState(world, "after-reinstall");
      assert.equal(partial.launches.length, 0);
      const restored = partial.manifest?.mods[REPAIRABLE.id];
      assert.equal(restored?.enabled, true);
      assert.equal(restored?.currentVpks.length, 1);
    });

    await step("Disable and launch keeps the reinstalled mod", async () => {
      await $('[data-testid="launch-repair-disable"]').click();
      await dialog.waitForDisplayed({ reverse: true });
      const launched = await observeUntil(
        "One launch after disabling",
        () => readBrokenState(world),
        (value) => value.launches.length === 1,
      );
      await captureBrokenState(world, "after-disable");
      assertRepairedOnly(launched, "after disable");
    });

    const final = await captureBrokenState(world, "final");
    await closeApplication(world, runtime.processId);
    const closed = await captureBrokenState(world, "closed");
    assert.deepEqual(closed.manifest, final.manifest);
    assert.deepEqual(closed.disk, final.disk);
    assertRepairedOnly(closed, "closed");
  });
});
