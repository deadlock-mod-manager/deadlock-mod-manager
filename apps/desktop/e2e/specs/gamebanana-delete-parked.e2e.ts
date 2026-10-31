import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $ } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  applyInstalledFiles,
  checkCatalog,
  installCatalog,
  toggleCatalog,
} from "../support/catalog-actions";
import { step } from "../support/evidence";
import {
  CATALOG_MOD_ID,
  CATALOG_MOD_NAME,
} from "../support/gamebanana-fixtures";
import { readCatalogState } from "../support/gamebanana-oracle";
import { observeUntil } from "../support/observations";
import { navigate, reveal } from "../support/ui";
import { assertOwnedWorld, collectFileInventory } from "../support/world";

const addonFiles = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return Object.keys(
    await collectFileInventory(
      path.join(roots.game, "game", "citadel", "addons"),
    ),
  )
    .filter((name) => name !== ".dmm.json")
    .sort();
};

const assertNothingLeft = async (world: string) => {
  assert.deepEqual((await readCatalogState(world)).localMods, []);
  assert.deepEqual(await addonFiles(world), []);
};

describe("catalog mod deletion", () => {
  it("deletes the variants Mod Options parked", async () => {
    const scenario = process.env.DMM_E2E_CASE_ID ?? "";
    const phase = process.env.DMM_E2E_PHASE;
    assert(phase === "delete-parked" || phase === "restart-deleted");
    const disableFirst = scenario === "gamebanana-delete-parked-disabled";
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "delete-parked.json");
    const files = ["common.vpk", "blue.vpk"];
    const downloads = ["variants.zip"];
    await navigate("mods");
    await $(`[title="${CATALOG_MOD_NAME}"]`).click();

    if (phase === "delete-parked") {
      await installCatalog(world, scenario, files);
      await checkCatalog(world, scenario, "initial-install", files, downloads);
      await applyInstalledFiles(["common.vpk"]);
      await checkCatalog(
        world,
        scenario,
        "parked-blue",
        ["common.vpk"],
        downloads,
        ["blue.vpk"],
      );
      if (disableFirst) await toggleCatalog(world, false);
      assert((await addonFiles(world)).includes(`${CATALOG_MOD_ID}_blue.vpk`));
      await step("delete the mod", async () => {
        const remove = await $("button=Delete Mod");
        await reveal(remove);
        await remove.click();
        await $('[role="alertdialog"]').$("button=Delete").click();
        await observeUntil(
          "Deleted catalog mod",
          () => readCatalogState(world),
          (state) => state.localMods.length === 0,
        );
        await assertNothingLeft(world);
      });
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
      await closeApplication(world, runtime.processId);
      await assertNothingLeft(world);
      return;
    }

    const previous = z
      .object({ processId: z.number() })
      .parse(JSON.parse(await readFile(checkpoint, "utf8")));
    assert.notEqual(runtime.processId, previous.processId);
    await assertNothingLeft(world);
    // A leftover parked copy would be picked back up by the next download.
    await installCatalog(world, scenario, files);
    await checkCatalog(world, scenario, "reinstalled", files, downloads);
    await closeApplication(world, runtime.processId);
  });
});
