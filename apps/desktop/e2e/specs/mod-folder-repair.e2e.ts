import assert from "node:assert/strict";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { readRepairState } from "../support/manifest-repair-oracle";
import {
  REPAIR_MODS,
  REPAIR_UNTRACKED,
} from "../support/mod-folder-repair-fixtures";
import {
  assertModFolderRepair,
  assertModFolderRepairPreview,
} from "../support/mod-folder-repair-oracle";
import { observeUntil } from "../support/observations";
import { openSettings } from "../support/settings-actions";
import { navigate, reveal } from "../support/ui";

describe("Repair mod folder", () => {
  it("previews and repairs damaged state, survives restart, and restores its backup", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    assert(
      phase === "repair-folder" ||
        phase === "restart-folder" ||
        phase === "restart-restored-folder",
    );
    if (phase === "repair-folder") {
      await openSettings("tools");
      await step(
        "preview the damaged active profile and cancel without changing it",
        async () => {
          const action = await $("button=Repair mod folder");
          await reveal(action);
          await action.click();
          const dialog = await $('[role="dialog"]');
          await dialog.waitForDisplayed();
          for (const name of REPAIR_UNTRACKED)
            await expect(dialog).toHaveText(expect.stringContaining(name));
          await expect(dialog).toHaveText(
            expect.stringContaining("will be moved to a backup"),
          );
          await expect(dialog).toHaveText(
            expect.stringContaining("list of your mods is damaged"),
          );
          await expect(dialog).toHaveText(
            expect.stringContaining(".dmm-reorder"),
          );
          await browser.saveScreenshot(
            path.join(world, "artifacts", "repair-preview.png"),
          );
          await dialog.$("button=Cancel").click();
          await expect(dialog).not.toBeDisplayed();
          await assertModFolderRepairPreview(world);
        },
      );
      await step("apply repair through Tools", async () => {
        await $("button=Repair mod folder").click();
        const dialog = await $('[role="dialog"]');
        await dialog.waitForDisplayed();
        await dialog.$("button=Repair").click();
        await expect(dialog).toHaveText(
          expect.stringContaining("Mod folder repaired"),
        );
        await expect(dialog).toHaveText(
          expect.stringContaining("3 files were moved to a backup"),
        );
        await browser.saveScreenshot(
          path.join(world, "artifacts", "repair-result.png"),
        );
        await dialog.$("button=Close").click();
        await observeUntil(
          "repaired installed state",
          () => readRepairState(world),
          (state) =>
            state.localMods.filter((mod) => mod.status === "installed")
              .length === 2,
        );
        await assertModFolderRepair(world, "applied");
      });
      await step(
        "disable and enable a tracked mod after repairing",
        async () => {
          await navigate("my-mods");
          const toggle = await $(
            `//*[@title="${REPAIR_MODS[1]}"]/ancestor::*[.//*[@role="switch"]][1]//*[@role="switch"]`,
          );
          await toggle.waitForClickable();
          await expect(toggle).toHaveAttribute("aria-checked", "true");
          await toggle.click();
          await observeUntil(
            "disabled repaired mod",
            () => readRepairState(world),
            (state) =>
              state.localMods.find((mod) => mod.remoteId === REPAIR_MODS[1])
                ?.status === "downloaded" &&
              (state.enabledMods[REPAIR_MODS[1]]?.enabled ?? false) === false,
          );
          await expect(toggle).toHaveAttribute("aria-checked", "false");
          await toggle.waitForClickable();
          await toggle.click();
          await observeUntil(
            "enabled repaired mod",
            () => readRepairState(world),
            (state) =>
              state.localMods.find((mod) => mod.remoteId === REPAIR_MODS[1])
                ?.status === "installed" &&
              (state.enabledMods[REPAIR_MODS[1]]?.enabled ?? false) === true,
          );
          await assertModFolderRepair(world, "toggled");
        },
      );
    } else if (phase === "restart-folder") {
      const backupName = await assertModFolderRepair(world, "restarted");
      await step(
        "restore only the removed VPKs from the existing Backups UI",
        async () => {
          await openSettings("backups");
          const row = await $(`[data-backup-name="${backupName}"]`);
          await row.waitForDisplayed();
          await reveal(row);
          await browser.saveScreenshot(
            path.join(world, "artifacts", "repair-backup.png"),
          );
          await row.$("button=Restore").click();
          const dialog = await $('[role="dialog"]');
          await dialog.waitForDisplayed();
          await expect(dialog).toHaveText(
            expect.stringContaining("Existing files are never overwritten"),
          );
          await dialog.$("button=Restore").click();
          await expect(
            $("[data-sonner-toast][data-type='success']"),
          ).toHaveText(expect.stringContaining("Backup restored"));
          await assertModFolderRepair(world, "restored", true);
        },
      );
    } else await assertModFolderRepair(world, "restarted-restored", true);
    await closeApplication(world, runtime.processId);
    await assertModFolderRepair(
      world,
      `closed-${phase}`,
      phase !== "repair-folder",
    );
  });
});
