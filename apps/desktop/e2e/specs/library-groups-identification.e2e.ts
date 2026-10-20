import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  createGroup,
  expectMembership,
  moveSelected,
  selectMods,
} from "../support/library-groups-actions";
import { readLibraryGroups } from "../support/library-groups-oracle";
import { ALPHA } from "../support/profile-fixtures";
import { CATALOG_MOD_ID, catalogVpk } from "../support/gamebanana-fixtures";
import { observeUntil } from "../support/observations";
import { navigate } from "../support/ui";

const ALIAS = "local-unidentified";

describe("grouped addon identification", () => {
  it("keeps organization when analysis replaces a placeholder with its catalog identity", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    if (process.env.DMM_E2E_PHASE === "identify") {
      await createGroup("Detected cosmetics");
      await selectMods([ALIAS]);
      await moveSelected("Detected cosmetics");
      await $('button[aria-label="Done selecting"]').click();
      await $('button[aria-label="More actions"]').click();
      await browser.keys("ArrowDown");
      await $('[role="menuitem"]=Analyze Local Addons').click();
      await observeUntil(
        "placeholder replaced with catalog identity",
        () => readLibraryGroups(world),
        (state) =>
          state.localMods.length === 1 &&
          state.localMods[0].remoteId === CATALOG_MOD_ID,
      );
    }
    await expectMembership(world, { "Detected cosmetics": [CATALOG_MOD_ID] });
    const directory = path.join(
      world,
      "game-install",
      "game",
      "citadel",
      "addons",
      ALPHA.folder,
    );
    const manifest = z
      .object({
        mods: z.record(
          z.string(),
          z.object({
            enabled: z.boolean(),
            order: z.number(),
            currentVpks: z.array(z.string()),
          }),
        ),
      })
      .parse(
        JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
      );
    assert.deepEqual(Object.keys(manifest.mods), [CATALOG_MOD_ID]);
    assert.equal(manifest.mods[CATALOG_MOD_ID].enabled, true);
    assert.equal(manifest.mods[CATALOG_MOD_ID].order, 0);
    assert.deepEqual(manifest.mods[CATALOG_MOD_ID].currentVpks, [
      "pak01_dir.vpk",
    ]);
    assert.deepEqual(
      await readFile(path.join(directory, "pak01_dir.vpk")),
      catalogVpk("common.vpk"),
    );
    await closeApplication(world, runtime.processId);
  });
});
