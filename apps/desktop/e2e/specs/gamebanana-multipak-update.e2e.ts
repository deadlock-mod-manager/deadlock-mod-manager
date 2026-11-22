import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { $, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { chooseInstallFiles } from "../support/catalog-actions";
import { step } from "../support/evidence";
import { readCatalogState } from "../support/gamebanana-oracle";
import { MULTIPAK_MODS } from "../support/multipak-update-fixtures";
import { assertMultipakDisk } from "../support/multipak-update-oracle";
import { observeUntil } from "../support/observations";
import { navigate, reveal } from "../support/ui";

const openMod = async (name: string) => {
  await navigate("mods");
  await $(`[title="${name}"]`).click();
};
const waitStatus = (world: string, id: string, status: string) =>
  observeUntil(
    `${id} is ${status}`,
    () => readCatalogState(world),
    (state) =>
      state.localMods.find((mod) => mod.remoteId === id)?.status === status,
  );

describe("multipak updates", () => {
  it("preserves file ownership across batch update, toggles, restart and uninstall", async () => {
    const phase = z
      .enum(["update-toggle", "restart-uninstall"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "multipak-process.json");
    const [a, b] = MULTIPAK_MODS;
    if (phase === "update-toggle") {
      for (const mod of MULTIPAK_MODS)
        await step(`install ${mod.name} v1`, async () => {
          await openMod(mod.name);
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
          await expect($('[role="switch"]')).toHaveAttribute(
            "aria-checked",
            "true",
          );
        });
      await step("v1 ownership", () =>
        assertMultipakDisk(world, "installed-v1", {
          version: "v1",
          a: "enabled",
        }),
      );
      await step("update both multipak mods through Update All", async () => {
        await navigate("my-mods");
        const check = await $('button[aria-label="Check for updates"]');
        await check.waitForEnabled({ timeout: 30_000 });
        await check.click();
        await $("button=2 updates available").click();
        const dialog = await $('[role="dialog"]');
        for (const mod of MULTIPAK_MODS)
          await expect(dialog).toHaveText(expect.stringContaining(mod.name));
        await dialog.$("button=Update All").click();
        await expect(dialog).not.toBeDisplayed({ wait: 30_000 });
        // Both were already installed at v1, so wait for the v2 files too.
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
      });
      const updated = await step("v2 ownership", () =>
        assertMultipakDisk(world, "updated-v2", {
          version: "v2",
          a: "enabled",
        }),
      );
      await openMod(a.name);
      for (const enabled of [false, true])
        await step(`${enabled ? "enable" : "disable"} only mod A`, async () => {
          const toggle = await $('[role="switch"]');
          await reveal(toggle);
          await toggle.waitForClickable();
          await toggle.click();
          await expect($('[role="switch"]')).toHaveAttribute(
            "aria-checked",
            String(enabled),
          );
          await waitStatus(world, a.id, enabled ? "installed" : "downloaded");
          await expect($('[role="switch"]')).toBeEnabled();
          if (!enabled)
            await observeUntil(
              "disabled A has no enabled VPK locators after reconciliation",
              () => readCatalogState(world),
              (state) =>
                state.localMods.find((mod) => mod.remoteId === a.id)
                  ?.installedVpks?.length === 0,
            );
          const current = await assertMultipakDisk(
            world,
            enabled ? "reenabled-a" : "disabled-a",
            { version: "v2", a: enabled ? "enabled" : "disabled" },
          );
          assert.deepEqual(
            current.manifest.mods[b.id],
            updated.manifest.mods[b.id],
            "Toggling A must preserve B's slots",
          );
          for (const file of updated.manifest.mods[b.id].currentVpks)
            assert.equal(
              current.inventory[file],
              updated.inventory[file],
              "Toggling A must preserve B's bytes",
            );
        });
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, previous.processId);
      await step("fresh process v2 ownership", () =>
        assertMultipakDisk(world, "restarted-v2", {
          version: "v2",
          a: "enabled",
        }),
      );
      await step("uninstall only mod A", async () => {
        await openMod(a.name);
        const remove = await $("button=Delete Mod");
        await reveal(remove);
        await remove.click();
        await $('[role="alertdialog"]').$("button=Delete").click();
        await observeUntil(
          "A removed from library",
          () => readCatalogState(world),
          (state) => !state.localMods.some((mod) => mod.remoteId === a.id),
        );
        await assertMultipakDisk(world, "uninstalled-a", {
          version: "v2",
          a: "deleted",
        });
      });
    }
    await closeApplication(world, runtime.processId);
    await assertMultipakDisk(world, `closed-${phase}`, {
      version: "v2",
      a: phase === "update-toggle" ? "enabled" : "deleted",
    });
  });
});
