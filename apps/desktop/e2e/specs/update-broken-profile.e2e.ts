import assert from "node:assert/strict";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { brokenProfileDirectory } from "../support/broken-profile-fixtures";
import { chooseInstallFiles } from "../support/catalog-actions";
import { step } from "../support/evidence";
import { readCatalogState } from "../support/gamebanana-oracle";
import { MULTIPAK_MODS } from "../support/multipak-update-fixtures";
import { assertMultipakDisk } from "../support/multipak-update-oracle";
import { observeUntil } from "../support/observations";
import { BETA } from "../support/profile-fixtures";
import { navigate } from "../support/ui";
import { assertOwnedWorld, collectFileInventory } from "../support/world";

const waitStatus = (world: string, id: string, status: string) =>
  observeUntil(
    `${id} is ${status}`,
    () => readCatalogState(world),
    (state) =>
      state.localMods.find((mod) => mod.remoteId === id)?.status === status,
  );

describe("updates beside a broken inactive profile", () => {
  it("backs up, updates and restores without judging the other profile", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const {
      configuration: {
        roots: { game },
      },
    } = await assertOwnedWorld(world);
    const citadel = path.join(game, "game", "citadel");
    const beta = brokenProfileDirectory(game);
    const betaBefore = await collectFileInventory(beta);
    const assertBetaUntouched = async (checkpoint: string) =>
      assert.deepEqual(
        await collectFileInventory(beta),
        betaBefore,
        `${checkpoint}: the broken profile must stay byte-identical`,
      );

    for (const mod of MULTIPAK_MODS)
      await step(`install ${mod.name} v1`, async () => {
        await navigate("mods");
        await $(`[title="${mod.name}"]`).click();
        await $('button[aria-label="Download Mod"]').click();
        await waitStatus(world, mod.id, "downloaded");
        const toggle = await $('[role="switch"]');
        await toggle.waitForClickable();
        await toggle.click();
        const local = (await readCatalogState(world)).localMods.find(
          (item) => item.remoteId === mod.id,
        );
        assert(local?.installedFileTree);
        await chooseInstallFiles(local.installedFileTree.files);
        await waitStatus(world, mod.id, "installed");
      });

    await step("Update All succeeds", async () => {
      await navigate("my-mods");
      const check = await $('button[aria-label="Check for updates"]');
      await check.waitForEnabled({ timeout: 30_000 });
      await check.click();
      await $("button=2 updates available").click();
      const dialog = await $('[role="dialog"]');
      await dialog.$("button=Update All").click();
      await expect(dialog).not.toBeDisplayed({ wait: 30_000 });
      await expect(
        $('[data-testid="batch-update-failure"]'),
      ).not.toBeExisting();
      await observeUntil(
        "v2 files recorded",
        () => readCatalogState(world),
        (state) =>
          MULTIPAK_MODS.every((mod) => {
            const local = state.localMods.find(
              (item) => item.remoteId === mod.id,
            );
            return (
              local?.status === "installed" &&
              isDeepStrictEqual(
                local.installedFileTree?.files
                  .filter((file) => file.is_selected)
                  .map((file) => file.name)
                  .sort(),
                mod.versions.v2.toSorted(),
              )
            );
          }),
      );
      await assertMultipakDisk(world, "updated-v2", {
        version: "v2",
        a: "enabled",
      });
      await assertBetaUntouched("updated");
    });

    const backupPath = await step("backup copies every profile", async () => {
      const backups = await browser.execute(() =>
        window.__TAURI_INTERNALS__.invoke<
          Array<{ file_name: string; file_path: string }>
        >("list_addons_backups"),
      );
      assert.equal(backups.length, 1);
      const backup = path.resolve(backups[0].file_path);
      assert.equal(
        backup,
        path.join(citadel, "addons-backups", backups[0].file_name),
      );
      assert.deepEqual(
        await collectFileInventory(path.join(backup, "addons", BETA.folder)),
        betaBefore,
        "The backup keeps the broken profile as it was",
      );
      return backup;
    });
    const backupBefore = await collectFileInventory(backupPath);

    await step("restore the pre-update backup", async () => {
      await navigate("settings");
      const tab = await $("button=Backups");
      await tab.scrollIntoView({ block: "center" });
      await tab.click();
      await $("button=Restore").click();
      await $('[role="dialog"]').$("button=Restore").click();
      await $(
        '//*[@data-sonner-toast]//*[@data-title and normalize-space()="Backup restored successfully"]',
      ).waitForDisplayed();
      assert.deepEqual(
        await collectFileInventory(path.join(citadel, "addons")),
        await collectFileInventory(path.join(backupPath, "addons")),
        "Restore puts back the v1 addons",
      );
      assert.deepEqual(await collectFileInventory(backupPath), backupBefore);
      await assertBetaUntouched("restored");
    });

    await closeApplication(world, runtime.processId);
    await assertBetaUntouched("closed");
  });
});
