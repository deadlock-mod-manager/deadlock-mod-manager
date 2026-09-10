import { navigate, activateProfile } from "../support/ui";
import { startApplication } from "../support/application";
import assert from "node:assert/strict";
import { readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { ALPHA } from "../support/profile-fixtures";
import { filesystemModIds } from "../support/filesystem-fixtures";
import {
  assertFilesystemLayout,
  filesystemManifestSchema,
  filesystemPaths,
  fingerprint,
  shardSlot,
} from "../support/filesystem-oracle";
import { collectFileInventory } from "../support/world";
import { holdVpkLock } from "../support/windows-lock";
import { readProfileState } from "../support/profile-oracle";
import {
  closeApplication,
  retireClosedApplication,
} from "../support/application-exit";

const reorder = async (
  world: string,
  order: string[],
  crash = false,
): Promise<string | null> => {
  const { alpha } = await filesystemPaths(world);
  const manifest = filesystemManifestSchema.parse(
    JSON.parse(await readFile(path.join(alpha, ".dmm.json"), "utf8")),
  );
  const data: Array<[string, string[], number]> = order.map((id, index) => [
    id,
    manifest.mods[id].currentVpks,
    index,
  ]);
  return browser.execute(
    async (folder, modOrderData, abrupt) => {
      if (abrupt) {
        window.setTimeout(() => {
          void window.__TAURI_INTERNALS__.invoke("reorder_mods_by_remote_id", {
            profileFolder: folder,
            modOrderData,
          });
        }, 100);
        return null;
      }
      try {
        await window.__TAURI_INTERNALS__.invoke("reorder_mods_by_remote_id", {
          profileFolder: folder,
          modOrderData,
        });
        return null;
      } catch (error) {
        return JSON.stringify(error);
      }
    },
    ALPHA.folder,
    data,
    crash,
  );
};

const openBackups = async (): Promise<void> => {
  await navigate("settings");
  const tab = await $("button=Backups");
  await tab.scrollIntoView({ block: "center" });
  await tab.click();
  await $("button=Create Backup").waitForDisplayed();
};

describe("filesystem recovery", () => {
  it("preserves owned payloads through a filesystem failure and fresh process", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const { configuration, citadel, alpha, artifacts } =
      await filesystemPaths(world);
    const caseId = configuration.caseId;
    const original = filesystemModIds(caseId);
    const changed = [...original.slice(1), original[0]];
    const processFile = path.join(artifacts, "filesystem-process.json");
    const isBackup = caseId.startsWith("filesystem-backup-");
    const expectedOrder =
      isBackup || caseId === "filesystem-crash-placed" ? original : changed;
    const extras =
      caseId === "filesystem-backup-merge"
        ? {
            [`addons/${ALPHA.folder}/after-backup.txt`]: fingerprint(
              Buffer.from("Created after backup\n"),
            ),
          }
        : {};

    if (process.env.DMM_E2E_PHASE === "restart-filesystem") {
      const prior = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(processFile, "utf8")));
      assert.notEqual(runtime.processId, prior.processId);
      await assertFilesystemLayout(world, "restarted", expectedOrder, extras);
      // Opening the profile selector and reactivating Alpha runs the normal frontend
      // manifest reconciliation, including a commit that outlived its IPC response.
      await navigate("my-mods");
      await activateProfile("E2E Beta");
      await browser.waitUntil(
        async () =>
          (await readProfileState(world)).activeProfileId !== ALPHA.id,
      );
      await activateProfile("E2E Alpha");
      await browser.waitUntil(async () => {
        const state = await readProfileState(world);
        return (
          state.activeProfileId === ALPHA.id &&
          state.localMods.find((mod) => mod.remoteId === expectedOrder[0])
            ?.installOrder === 0
        );
      });
      await browser.keys("Escape");
      const state = await readProfileState(world);
      const expectedMods = expectedOrder.map((remoteId, index) => ({
        remoteId,
        status: "installed",
        installOrder: index,
        installedVpks: [shardSlot(index).filename],
      }));
      assert.deepEqual(
        state.localMods.toSorted((a, b) => a.installOrder - b.installOrder),
        expectedMods,
      );
      assert.deepEqual(
        state.profiles[ALPHA.id].mods.toSorted(
          (a, b) => a.installOrder - b.installOrder,
        ),
        expectedMods,
      );
      assert.deepEqual(
        state.profiles[ALPHA.id].enabledMods,
        Object.fromEntries(expectedOrder.map((id) => [id, { enabled: true }])),
      );
      await expect($(`[title="${expectedOrder[0]}"]`)).toBeDisplayed();
      await assertFilesystemLayout(world, "reconciled", expectedOrder, extras);
      await closeApplication(world, runtime.processId);
      assert.deepEqual(
        await readProfileState(world),
        state,
        "Exit must preserve the reconciled profile state",
      );
      await assertFilesystemLayout(
        world,
        "closed-reconciled",
        expectedOrder,
        extras,
      );
      return;
    }
    assert.equal(process.env.DMM_E2E_PHASE, "mutate");
    if (caseId !== "filesystem-collision")
      await assertFilesystemLayout(world, "initial", original);
    await writeFile(
      processFile,
      JSON.stringify({ processId: runtime.processId }),
    );

    if (caseId.startsWith("filesystem-crash-")) {
      const point =
        caseId === "filesystem-crash-placed" ? "placed" : "committed";
      await writeFile(
        path.join(artifacts, "crash-arm.txt"),
        `${runtime.processId}:${point}`,
      );
      await reorder(world, changed, true);
      // Poll disk without making another request to the deliberately dying webview.
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await readFile(path.join(artifacts, "crash-observed.json"));
          await retireClosedApplication(runtime.processId);
          return;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("code" in error) ||
            error.code !== "ENOENT"
          )
            throw error;
        }
        await setTimeout(100);
      }
      throw new Error("Armed transaction did not reach the crash checkpoint");
    }

    if (isBackup) {
      await openBackups();
      await $("button=Create Backup").click();
      await $("button=Restore").waitForDisplayed();
      const backups = await browser.execute(() =>
        window.__TAURI_INTERNALS__.invoke<
          Array<{ file_name: string; file_path: string; addons_count: number }>
        >("list_addons_backups"),
      );
      assert.equal(backups.length, 1);
      assert.equal(backups[0].addons_count, 5);
      const backupPath = path.resolve(backups[0].file_path);
      assert(
        backupPath.startsWith(world + path.sep),
        "Backup must remain in the owned world",
      );
      assert.equal(
        backupPath,
        path.join(citadel, "addons-backups", backups[0].file_name),
      );
      const backupBefore = await collectFileInventory(backupPath);
      await writeFile(
        path.join(artifacts, "filesystem-backup.json"),
        JSON.stringify({
          fileName: backups[0].file_name,
          inventory: backupBefore,
        }),
      );
      assert.equal(await reorder(world, changed), null);
      await assertFilesystemLayout(world, "before-restore", changed);
      await writeFile(
        path.join(alpha, "protected.txt"),
        "Changed after backup\n",
      );
      await writeFile(
        path.join(alpha, "after-backup.txt"),
        "Created after backup\n",
      );
      await $("button=Restore").click();
      if (caseId === "filesystem-backup-merge")
        await $('[role="dialog"]').$("#merge").click();
      await $('[role="dialog"]').$("button=Restore").click();
      await $(
        '//*[@data-sonner-toast]//*[@data-title and normalize-space()="Backup restored successfully"]',
      ).waitForDisplayed();
      await assertFilesystemLayout(world, "restored", original, extras);
      assert.deepEqual(
        await collectFileInventory(backupPath),
        backupBefore,
        "Restore cannot mutate its source snapshot",
      );
    } else {
      const before = await collectFileInventory(citadel);
      if (caseId === "filesystem-lock" || caseId === "filesystem-collision") {
        const release =
          caseId === "filesystem-lock"
            ? await holdVpkLock(world)
            : async () => {};
        let failure: string | null;
        try {
          failure = await reorder(world, changed);
        } finally {
          await release();
        }
        assert.match(
          failure ?? "",
          caseId === "filesystem-lock"
            ? /os error 32|being used by another process/i
            : /already exists/i,
        );
        assert.deepEqual(
          await collectFileInventory(citadel),
          before,
          "Failure must restore every original file and manifest",
        );
        await writeFile(
          path.join(artifacts, "filesystem-rollback.json"),
          JSON.stringify({ failure, inventory: before }, null, 2),
        );
        if (caseId === "filesystem-collision") {
          await unlink(path.join(alpha, "pak03_dir.vpk", "protected.txt"));
          await rmdir(path.join(alpha, "pak03_dir.vpk"));
        }
      }
      assert.equal(await reorder(world, changed), null);
      await assertFilesystemLayout(world, "retry-succeeded", changed);
    }
    await closeApplication(world, runtime.processId);
    await assertFilesystemLayout(
      world,
      "closed-mutation",
      expectedOrder,
      extras,
    );
  });
});
