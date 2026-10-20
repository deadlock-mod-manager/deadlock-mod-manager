import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { $, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  HAZE_CURRENT,
  HAZE_SWAP,
  hazeModel,
} from "../support/hero-swap-fixtures";
import { observeUntil } from "../support/observations";
import { ALPHA } from "../support/profile-fixtures";
import {
  deleteMod,
  findMod,
  setModEnabled,
  waitForSwitch,
} from "../support/shard-actions";
import { readShardStore } from "../support/shard-oracle";
import { navigate } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({ enabled: z.boolean(), currentVpks: z.array(z.string()) }),
  ),
});

const readManifest = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return manifestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(
          roots.game,
          "game",
          "citadel",
          "addons",
          ALPHA.folder,
          ".dmm.json",
        ),
        "utf8",
      ),
    ),
  );
};

/** Which skins' Haze model the game would mount from gameinfo.gi right now. */
const readLoadedHazeModels = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const game = path.join(roots.game, "game");
  const gameinfo = await readFile(
    path.join(game, "citadel", "gameinfo.gi"),
    "utf8",
  );
  const searchPaths = [
    ...gameinfo.matchAll(/^\s*Game\s+(citadel\/\S+)\s*$/gm),
  ].map((match) => match[1]);
  const loaded: string[] = [];
  for (const searchPath of searchPaths) {
    const directory = path.join(game, searchPath);
    const names = await readdir(directory).catch(() => []);
    for (const name of names.filter((entry) =>
      /^pak\d{2}_dir\.vpk$/.test(entry),
    )) {
      const bytes = await readFile(path.join(directory, name));
      for (const id of [HAZE_CURRENT, HAZE_SWAP])
        if (bytes.includes(hazeModel(id)))
          loaded.push(`${id} via ${searchPath}/${name}`);
    }
  }
  return { searchPaths, loaded };
};

const expectOnlyHaze = (world: string, active: string) =>
  step(`only ${active} is active and loaded`, async () => {
    const other = active === HAZE_CURRENT ? HAZE_SWAP : HAZE_CURRENT;
    const store = await observeUntil(
      `${active} replaced ${other} in the library`,
      () => readShardStore(world),
      (state) =>
        state.localMods.find((mod) => mod.remoteId === active)?.status ===
          "installed" &&
        state.localMods.find((mod) => mod.remoteId === other)?.status !==
          "installed",
    );
    assert.equal(
      store.profiles[store.activeProfileId]?.enabledMods[other]?.enabled ??
        false,
      false,
      `${other} is still enabled in the active profile`,
    );
    const manifest = await readManifest(world);
    assert.equal(manifest.mods[active]?.enabled, true);
    assert.equal(manifest.mods[active]?.currentVpks.length, 1);
    if (manifest.mods[other]) {
      assert.equal(manifest.mods[other].enabled, false);
      assert.deepEqual(manifest.mods[other].currentVpks, []);
    }
    // The bug report: the old skin keeps showing in game after the swap.
    const { searchPaths, loaded } = await readLoadedHazeModels(world);
    assert.deepEqual(
      loaded.map((entry) => entry.split(" ")[0]),
      [active],
      `Mounted Haze models ${JSON.stringify(loaded)} from gameinfo.gi search paths ${JSON.stringify(searchPaths)}`,
    );
  });

describe("hero mod swap (#741)", () => {
  it("swapping a hero's mod stops loading the previous one", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    if (process.env.DMM_E2E_PHASE === "swap") {
      // Start from one active Haze skin and a second one downloaded.
      await setModEnabled(world, HAZE_SWAP, false);
      await expectOnlyHaze(world, HAZE_CURRENT);

      await step(`enable ${HAZE_SWAP} and swap`, async () => {
        await findMod(HAZE_SWAP);
        await waitForSwitch(HAZE_SWAP, false, true);
        await $(
          `[role="switch"][aria-label="Enable mod ${HAZE_SWAP}"]`,
        ).click();
        const dialog = $('[role="alertdialog"]');
        await dialog.waitForDisplayed();
        await expect(dialog).toHaveText(
          expect.stringContaining("Haze already has a mod"),
        );
        await dialog.$("button=Swap mods").click();
        await expect(dialog).not.toBeDisplayed();
      });
      await expectOnlyHaze(world, HAZE_SWAP);

      // Fully removing the previous skin must not bring it back either.
      await deleteMod(world, HAZE_CURRENT);
      await expectOnlyHaze(world, HAZE_SWAP);
    } else if (process.env.DMM_E2E_PHASE === "restart-swap") {
      await expectOnlyHaze(world, HAZE_SWAP);
    } else throw new Error("Unknown hero swap phase");
    await closeApplication(world, runtime.processId);
    await expectOnlyHaze(world, HAZE_SWAP);
  });
});
