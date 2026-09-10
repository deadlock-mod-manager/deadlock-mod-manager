import { $, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  assertLifecycleDisk,
  readLifecycleState,
} from "../support/lifecycle-oracle";
import { selectNativeFixture } from "../support/native-picker";

const checkpointSchema = z.object({ modId: z.string(), processId: z.number() });

const openLibrary = async (): Promise<void> => {
  const link = await $('a[href="/my-mods"]');
  await link.waitForClickable();
  await link.click();
  await expect($('[title="e2e-local-mod"]')).toBeDisplayed();
};

const waitForStatus = async (
  world: string,
  status: string,
): Promise<string> => {
  await browser.waitUntil(
    async () => {
      const state = await readLifecycleState(world);
      return status === "deleted"
        ? state.localMods.length === 0
        : state.localMods[0]?.status === status;
    },
    {
      timeout: 15_000,
      timeoutMsg: `Persisted lifecycle state did not reach ${status}`,
    },
  );
  return (await readLifecycleState(world)).localMods[0]?.remoteId ?? "";
};

const toggle = async (
  world: string,
  modId: string,
  enabled: boolean,
  step: string,
): Promise<void> => {
  const control = await $('[role="switch"]');
  await control.waitForClickable();
  await control.click();
  const status = enabled ? "installed" : "downloaded";
  await waitForStatus(world, status);
  await expect($('[role="switch"]')).toHaveAttribute(
    "aria-checked",
    String(enabled),
  );
  await assertLifecycleDisk(world, step, modId, status);
};

describe("local mod lifecycle", () => {
  it("keeps UI, manifest, store, and bytes consistent across a fresh process", async () => {
    const dismiss = await $("button=Got it!");
    if (await dismiss.isDisplayed()) await dismiss.click();
    const runtime = await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke<{
        processId: number;
        roots: { world: string };
      }>("e2e_status"),
    );
    const world = runtime.roots.world;
    const checkpointPath = path.join(
      world,
      "artifacts",
      "lifecycle-checkpoint.json",
    );
    if (process.env.DMM_E2E_PHASE === "import-toggle") {
      const link = await $('a[href="/my-mods"]');
      await link.waitForClickable();
      await link.click();
      const addLocal = await $("button=Add Local Mod");
      await addLocal.waitForClickable();
      await addLocal.click();
      await selectNativeFixture(runtime.processId, world, async () => {
        const dropArea = await $(
          '[role="button"][aria-label="Drop files/folders here, or click to select"]',
        );
        await dropArea.waitForClickable();
        await dropArea.click();
      });
      const add = await $('[role="dialog"]').$("button=Add");
      await add.waitForClickable();
      await add.click();
      const modId = await waitForStatus(world, "downloaded");
      await openLibrary();
      await expect($('[role="switch"]')).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await assertLifecycleDisk(world, "imported", modId, "downloaded");
      const parsed = await browser.execute(
        (filePath: string) =>
          window.__TAURI_INTERNALS__.invoke<{
            entries: Array<{ fullPath: string }>;
          }>("parse_vpk_file", { filePath }),
        path.join(world, "fixtures", "e2e-local-mod.vpk"),
      );
      expect(parsed.entries.map((entry) => entry.fullPath)).toEqual([
        "scripts/e2e-lifecycle.txt",
      ]);
      await toggle(world, modId, true, "enabled");
      await toggle(world, modId, false, "disabled");
      await toggle(world, modId, true, "reenabled");
      await writeFile(
        checkpointPath,
        JSON.stringify({ modId, processId: runtime.processId }),
      );
    } else if (process.env.DMM_E2E_PHASE === "restart-delete") {
      const checkpoint = checkpointSchema.parse(
        JSON.parse(await readFile(checkpointPath, "utf8")),
      );
      expect(runtime.processId).not.toBe(checkpoint.processId);
      await openLibrary();
      await expect($('[role="switch"]')).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await waitForStatus(world, "installed");
      await assertLifecycleDisk(
        world,
        "restarted",
        checkpoint.modId,
        "installed",
      );
      const remove = await $('button[aria-label="Remove mod"]');
      await remove.waitForClickable();
      await remove.click();
      const confirm = await $('[role="alertdialog"]').$("button=Delete");
      await confirm.waitForClickable();
      await confirm.click();
      await waitForStatus(world, "deleted");
      await expect($('[title="e2e-local-mod"]')).not.toExist();
      await assertLifecycleDisk(world, "deleted", checkpoint.modId, "deleted");
    } else {
      throw new Error("Unknown lifecycle phase");
    }
  });
});
