import assert from "node:assert/strict";
import { mkdir, rm, rmdir } from "node:fs/promises";
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
import { assertOwnedWorld } from "../support/world";

const ids = REPAIR_MODS.map((mod) => mod.id);

const row = (id: string) =>
  $(`[data-testid="launch-repair-mod"][data-mod-id="${id}"]`);

/**
 * Each mod in `enabled` is installed with its own bytes; the rest are enabled
 * nowhere but stay in the library, unless listed in `gone`: a mod whose only
 * VPK was deleted with nothing left to restore it leaves the library.
 */
const holds = (
  observed: BrokenState,
  enabled: readonly string[],
  gone: readonly string[] = [],
) =>
  REPAIR_MODS.every((mod) => {
    const entry = observed.manifest?.mods[mod.id];
    const local = observed.state.localMods.find(
      (item) => item.remoteId === mod.id,
    );
    const profile = observed.state.profiles[ALPHA.id].enabledMods[mod.id];
    if (!enabled.includes(mod.id))
      return (
        (local !== undefined || gone.includes(mod.id)) &&
        entry?.enabled !== true &&
        profile?.enabled !== true
      );
    return (
      entry?.enabled === true &&
      entry.currentVpks.length === 1 &&
      observed.disk[entry.currentVpks[0]] ===
        fingerprint(repairPayload(mod.id)) &&
      local?.status === "installed" &&
      profile?.enabled === true
    );
  });

const assertHolds = (
  observed: BrokenState,
  enabled: readonly string[],
  label: string,
  gone: readonly string[] = [],
) => {
  assert.ok(
    holds(observed, enabled, gone),
    `${label}: expected only ${enabled.join(", ")} enabled; observed ${JSON.stringify(
      {
        manifest: observed.manifest,
        disk: observed.disk,
        localMods: observed.state.localMods,
        enabledMods: observed.state.profiles[ALPHA.id].enabledMods,
      },
    )}`,
  );
};

describe("launch repair after a reinstall", () => {
  it("disables only the mods the reinstall left broken", async () => {
    const phase = z
      .enum([
        "repair-partial",
        "restart-repair-partial",
        "relaunch-error",
        "relaunch-missing",
      ])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    if (phase === "restart-repair-partial") {
      await step("Restart keeps the repaired mod enabled", async () => {
        const restarted = await captureBrokenState(world, "restarted");
        assertHolds(restarted, [REPAIRABLE.id], "restarted");
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
    const relaunchMissing = phase === "relaunch-missing";
    const relaunchError = phase === "relaunch-error" || relaunchMissing;
    const enabledAfter = phase === "relaunch-error" ? ids : [REPAIRABLE.id];
    const gone = relaunchMissing ? [UNREPAIRABLE.id] : [];

    if (relaunchError)
      await step(
        "Reinstall restores both mods, then the launch fails",
        async () => {
          // The E2E build records each launch in this journal; a directory in
          // its place makes the launch itself fail after the repair.
          const journal = path.join(world, "artifacts", "game-launches.ndjson");
          await mkdir(journal);
          await $("button*=Launch modded").click();
          await dialog.waitForDisplayed();
          await $('[data-testid="launch-repair-reinstall"]').click();
          await $(
            '[data-testid="launch-repair-dialog"] [role="alert"]',
          ).waitForDisplayed({
            timeout: 60_000,
          });
          await browser.saveScreenshot(
            path.join(world, "artifacts", "relaunch-error.png"),
          );
          await expect(dialog).not.toHaveText(
            expect.stringContaining("Some mods could not be repaired"),
          );
          await rmdir(journal);
          // The store persists shortly after the dialog updates.
          await observeUntil(
            "Both mods reinstalled and enabled",
            () => readBrokenState(world),
            (value) => holds(value, ids),
          );
          const repaired = await captureBrokenState(world, "after-reinstall");
          assert.equal(repaired.launches.length, 0);
        },
      );
    else
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

    if (relaunchMissing)
      await step(
        "A VPK goes missing again, so the retried launch fails",
        async () => {
          const before = await readBrokenState(world);
          const vpk = before.manifest?.mods[UNREPAIRABLE.id]?.currentVpks[0];
          assert(vpk);
          const {
            configuration: { roots },
          } = await assertOwnedWorld(world);
          await rm(
            path.join(
              roots.game,
              "game",
              "citadel",
              "addons",
              ALPHA.folder,
              vpk,
            ),
          );
          await $('[data-testid="launch-repair-disable"]').click();
          await expect(dialog).toHaveText(
            expect.stringContaining(
              `files are missing for ${UNREPAIRABLE.name}`,
            ),
            { wait: 30_000 },
          );
          await browser.saveScreenshot(
            path.join(world, "artifacts", "relaunch-missing.png"),
          );
          const missing = await captureBrokenState(world, "relaunch-missing");
          assert.equal(missing.launches.length, 0);
          assert.equal(
            missing.manifest?.mods[REPAIRABLE.id]?.enabled,
            true,
            "The retried launch must not disable the repaired mod",
          );
        },
      );

    await step("Disable and launch keeps the reinstalled mods", async () => {
      await $('[data-testid="launch-repair-disable"]').click();
      await dialog.waitForDisplayed({ reverse: true });
      await observeUntil(
        `One launch with only ${enabledAfter.join(", ")} enabled`,
        () => readBrokenState(world),
        (value) =>
          value.launches.length === 1 && holds(value, enabledAfter, gone),
      );
      await captureBrokenState(world, "after-disable");
    });

    const final = await captureBrokenState(world, "final");
    await closeApplication(world, runtime.processId);
    const closed = await captureBrokenState(world, "closed");
    assert.deepEqual(closed.manifest, final.manifest);
    assert.deepEqual(closed.disk, final.disk);
    assertHolds(closed, enabledAfter, "closed", gone);
  });
});
