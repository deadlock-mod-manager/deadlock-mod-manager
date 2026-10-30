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
import { observeUntil } from "../support/observations";
import { openSettings, readSettings } from "../support/settings-actions";
import { navigate, reveal } from "../support/ui";

const waitStatus = (world: string, id: string, status: string) =>
  observeUntil(
    `${id} is ${status}`,
    () => readCatalogState(world),
    (state) =>
      state.localMods.find((mod) => mod.remoteId === id)?.status === status,
  );
const download = async (world: string, mod: (typeof MULTIPAK_MODS)[number]) => {
  await navigate("mods");
  await $(`[title="${mod.name}"]`).click();
  await $('button[aria-label="Download Mod"]').click();
  await waitStatus(world, mod.id, "downloaded");
};

// The network assertion checks which of these steps asked GameBanana for its
// fileservers, which only Automatic routing does.
describe("download routing", () => {
  it("applies Automatic routing to updates as well as new downloads", async () => {
    const phase = z
      .enum(["update-auto", "restart-download-auto"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "routing-process.json");
    const [a, b] = MULTIPAK_MODS;
    if (phase === "update-auto") {
      await step(`install ${a.name} v1 with Default routing`, async () => {
        assert.equal(
          (await readSettings(world)).fileserverPreference,
          "default",
        );
        await download(world, a);
        const toggle = await $('[role="switch"]');
        await toggle.waitForClickable();
        await toggle.click();
        const local = (await readCatalogState(world)).localMods.find(
          (item) => item.remoteId === a.id,
        );
        assert(local?.installedFileTree);
        await chooseInstallFiles(local.installedFileTree.files);
        await waitStatus(world, a.id, "installed");
      });
      await openSettings("network");
      await step("choose Automatic routing", async () => {
        const automatic = await $('[role="radio"][aria-label="Automatic"]');
        await reveal(automatic);
        await automatic.click();
        await expect(automatic).toHaveAttribute("aria-checked", "true");
        await observeUntil(
          "Automatic routing persisted",
          () => readSettings(world),
          (settings) => settings.fileserverPreference === "auto",
        );
      });
      await step(`update ${a.name} through Update All`, async () => {
        await navigate("my-mods");
        const check = await $('button[aria-label="Check for updates"]');
        await check.waitForEnabled({ timeout: 30_000 });
        await check.click();
        await $("button=1 update available").click();
        const dialog = await $('[role="dialog"]');
        await expect(dialog).toHaveText(expect.stringContaining(a.name));
        await dialog.$("button=Update All").click();
        await expect(dialog).not.toBeDisplayed({ wait: 30_000 });
        await observeUntil(
          "v2 files recorded",
          () => readCatalogState(world),
          (state) => {
            const local = state.localMods.find(
              (item) => item.remoteId === a.id,
            );
            return (
              local?.status === "installed" &&
              isDeepStrictEqual(
                local.installedFileTree?.files
                  .filter((file) => file.is_selected)
                  .map((file) => file.name)
                  .sort(),
                a.versions.v2.toSorted(),
              )
            );
          },
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
      await step(`download ${b.name} with Automatic routing`, async () => {
        assert.equal((await readSettings(world)).fileserverPreference, "auto");
        await download(world, b);
      });
    }
    await closeApplication(world, runtime.processId);
  });
});
