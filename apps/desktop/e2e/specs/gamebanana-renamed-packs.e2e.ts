import assert from "node:assert/strict";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { $, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  applyInstalledFiles,
  chooseInstallFiles,
} from "../support/catalog-actions";
import { step } from "../support/evidence";
import { readCatalogState } from "../support/gamebanana-oracle";
import { observeUntil } from "../support/observations";
import {
  PICKED_PACK,
  RENAMED_MODS,
  RENAMED_PACKS,
} from "../support/renamed-packs-fixtures";
import {
  assertRenamedPacksDisk,
  type RenamedExpectation,
} from "../support/renamed-packs-oracle";
import { navigate, selectDownloads } from "../support/ui";

const installFileIdentity = z.tuple([z.string(), z.string()]);
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
const enable = async (world: string, id: string) => {
  await waitStatus(world, id, "downloaded");
  const toggle = await $('[role="switch"]');
  await toggle.waitForClickable();
  await toggle.click();
};

const installed: RenamedExpectation = {
  [RENAMED_PACKS.id]: {
    version: "v1",
    vpks: ["a-kaze.vpk", "a-ember.vpk", "b-kaze.vpk"],
  },
  [PICKED_PACK.id]: { version: "v1", vpks: ["blue.vpk"] },
};
// The renamed pack keeps its pick and leaves out the VPK it gained; the
// picked pack installs what was chosen in the picker.
const updated: RenamedExpectation = {
  [RENAMED_PACKS.id]: { ...installed[RENAMED_PACKS.id], version: "v2" },
  [PICKED_PACK.id]: { version: "v2", vpks: ["green.vpk"] },
};

describe("packs re-uploaded under a new name", () => {
  it("carries the VPK pick over, or asks for one and retries the batch", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;

    await step("install both packs of the renamed mod", async () => {
      await openMod(RENAMED_PACKS.name);
      await $('button[aria-label="Download Mod"]').click();
      await selectDownloads(RENAMED_PACKS.files.map((file) => file.archive.v1));
      await enable(world, RENAMED_PACKS.id);
      await waitStatus(world, RENAMED_PACKS.id, "installed");
    });
    await applyInstalledFiles(
      [...installed[RENAMED_PACKS.id].vpks],
      RENAMED_PACKS.name,
    );
    await step("install only blue from the picked pack", async () => {
      await openMod(PICKED_PACK.name);
      await $('button[aria-label="Download Mod"]').click();
      await enable(world, PICKED_PACK.id);
      const local = (await readCatalogState(world)).localMods.find(
        (mod) => mod.remoteId === PICKED_PACK.id,
      );
      assert(local?.installedFileTree);
      await chooseInstallFiles(
        local.installedFileTree.files.filter(
          (file) => file.name === "blue.vpk",
        ),
      );
      await waitStatus(world, PICKED_PACK.id, "installed");
    });
    await step("v1 installed", () =>
      assertRenamedPacksDisk(world, "installed-v1", installed),
    );

    await step("Update All asks for the picked pack's VPKs", async () => {
      await navigate("my-mods");
      const check = await $('button[aria-label="Check for updates"]');
      await check.waitForEnabled({ timeout: 30_000 });
      await check.click();
      await $("button=2 updates available").click();
      const dialog = await $('[role="dialog"]');
      for (const mod of [RENAMED_PACKS, PICKED_PACK])
        await expect(dialog).toHaveText(expect.stringContaining(mod.name));
      await dialog.$("button=Update All").click();

      const picker = await $(
        '//*[@role="dialog" and contains(., "Select Files to Install")]',
      );
      await picker.waitForDisplayed({ timeout: 30_000 });
      await expect(picker).toHaveText(
        expect.stringContaining(PICKED_PACK.name),
      );
      const rows = await picker.$$("[data-install-file]");
      const names: string[] = [];
      for (const row of rows) {
        const identity = await row.getAttribute("data-install-file");
        assert(identity);
        const [, filePath] = installFileIdentity.parse(JSON.parse(identity));
        names.push(path.posix.basename(filePath));
        // Blue is gone, so nothing in the re-upload starts picked.
        await expect(row.$('[role="checkbox"]')).toHaveAttribute(
          "aria-checked",
          "false",
        );
      }
      assert.deepEqual(names.toSorted(), ["green.vpk", "red.vpk"]);
      await rows[names.indexOf("green.vpk")].click();
      await picker.$("button=Install Selected").click();
      // The pick re-runs the update with the renamed mod, whose first
      // download failed.
      await expect($('[role="dialog"]')).not.toBeDisplayed({ wait: 30_000 });
      await observeUntil(
        "v2 picks recorded",
        () => readCatalogState(world),
        (state) =>
          RENAMED_MODS.every((mod) => {
            const local = state.localMods.find(
              (item) => item.remoteId === mod.id,
            );
            const files = local?.installedFileTree?.files ?? [];
            const archives = new Set<string>(
              mod.files.map((file) => file.archive.v2),
            );
            return (
              local?.status === "installed" &&
              files.every((file) => archives.has(file.archive_name)) &&
              isDeepStrictEqual(
                files
                  .filter((file) => file.is_selected)
                  .map((file) => file.name)
                  .sort(),
                updated[mod.id].vpks.toSorted(),
              )
            );
          }),
      );
    });
    await step("v2 installed", () =>
      assertRenamedPacksDisk(world, "updated-v2", updated),
    );

    await closeApplication(world, runtime.processId);
    await assertRenamedPacksDisk(world, "closed", updated);
  });
});
