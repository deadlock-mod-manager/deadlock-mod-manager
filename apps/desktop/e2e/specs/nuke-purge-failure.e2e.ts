import assert from "node:assert/strict";
import { chmod, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { waitForStatus } from "../support/fixed-status";
import { readNukePurgeFailureSnapshot } from "../support/install-failure-fixtures";
import { observeUntil } from "../support/observations";
import {
  CHOICES,
  REINSTALLED_MOD,
} from "../support/reinstall-choices-fixtures";
import { navigate, waitForOverlaysClosed } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

describe("Nuke & Reinstall purge failure", () => {
  it("stops before clearing the cache or state when a VPK stays read-only", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const {
      configuration: { roots },
    } = await assertOwnedWorld(world);
    await navigate("my-mods");
    await waitForStatus(CHOICES.folder, REINSTALLED_MOD, "fixable");
    const vpk = path.join(
      roots.game,
      "game",
      "citadel",
      "addons",
      CHOICES.folder,
      "pak01_dir.vpk",
    );
    const before = await observeUntil(
      "fixture mod content indexing finished before the purge baseline",
      () => readNukePurgeFailureSnapshot(world),
      ({ state }) =>
        state.localMods.every(
          (mod) => mod.detectedContent === "other" && mod.detectedHero === null,
        ),
    );
    assert(
      Object.keys(before.cache).length > 0,
      "The download cache must start populated",
    );
    const { mode } = await stat(vpk);
    await chmod(vpk, 0o444);
    try {
      await step(
        "start Nuke & Reinstall and decline making the first VPK writable",
        async () => {
          const menu = await $('button[aria-label="More actions"]');
          await menu.waitForClickable();
          await menu.click();
          await browser.keys("ArrowDown");
          await $(
            '//*[@role="menuitem" and normalize-space()="Nuke & Reinstall"]',
          ).click();
          const dialog = await $('[role="dialog"]');
          await dialog.waitForDisplayed();
          await dialog.$("button=Continue").click();
          await dialog.$("button=Nuke it").click();
          const prompt = await $('[data-testid="readonly-file-dialog"]');
          await prompt.waitForDisplayed();
          assert.equal(
            path.normalize(
              await $('[data-testid="readonly-file-path"]').getText(),
            ),
            vpk,
          );
          await prompt.$("button=Cancel").click();
          await prompt.waitForDisplayed({ reverse: true });
        },
      );
      await step(
        "verify the purge error ends the run without reinstalling",
        async () => {
          const dialog = await $('[role="dialog"]');
          await expect(dialog).toHaveText(
            expect.stringContaining("Stopped after an error"),
          );
          await expect(dialog).toHaveText(
            expect.stringContaining("The run stopped early:"),
          );
          await expect(dialog).toHaveText(expect.stringContaining(vpk));
          await expect(dialog.$("p*=mods restored")).toHaveText(
            "0 of 1 mods restored.",
          );
          const after = await readNukePurgeFailureSnapshot(world);
          await writeFile(
            path.join(world, "artifacts", "nuke-purge-failure.json"),
            JSON.stringify({ before, after }, null, 2),
          );
          assert.deepEqual(
            after,
            before,
            "Purge failure must preserve persisted mods, manifest, VPKs and cache",
          );
          assert.equal((await stat(vpk)).mode & 0o777, 0o444);
          await dialog.$("button=Close").click();
          await waitForOverlaysClosed();
        },
      );
    } finally {
      await chmod(vpk, mode).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    await closeApplication(world, runtime.processId);
    assert.deepEqual(await readNukePurgeFailureSnapshot(world), before);
  });
});
