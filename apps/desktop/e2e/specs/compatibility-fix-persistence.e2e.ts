import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { $, browser } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  FIXED_MOD,
  FIXES,
  NEW_MOD_FILE,
  OTHER_MOD,
  UNRELATED_MOD,
} from "../support/compatibility-fix-fixtures";
import { step } from "../support/evidence";
import { readLifecycleState } from "../support/lifecycle-oracle";
import { observeUntil } from "../support/observations";
import { searchLibrary, setModEnabled } from "../support/shard-actions";
import { navigate, openAddLocalMod, waitForClickable } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      order: z.number().nullable(),
      compatibilityEnabled: z.boolean().optional(),
    }),
  ),
});

type FixModsResult = { status: "applied" | "reviewRequired" };

type RepairPackage = {
  searchPath: string | null;
  packageExists: boolean;
  inGameinfo: boolean;
};

// What a game started from Steam would load: the repair package on disk and
// the gameinfo.gi search path that mounts it.
const readRepairPackage = async (world: string): Promise<RepairPackage> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const citadel = path.join(roots.game, "game", "citadel");
  const folder = (await readdir(citadel)).find((name) =>
    name.startsWith("dmm_localization_"),
  );
  const gameinfo = await readFile(path.join(citadel, "gameinfo.gi"), "utf8");
  if (!folder)
    return { searchPath: null, packageExists: false, inGameinfo: false };
  const searchPath = `citadel/${folder}`;
  const packageExists = await readFile(
    path.join(citadel, folder, "pak01_dir.vpk"),
  ).then(
    () => true,
    () => false,
  );
  return {
    searchPath,
    packageExists,
    inGameinfo: gameinfo
      .split("\n")
      .some(
        (line) => line.trim().split(/\s+/).join(" ") === `Game ${searchPath}`,
      ),
  };
};

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
          FIXES.folder,
          ".dmm.json",
        ),
        "utf8",
      ),
    ),
  );
};

const DROP_AREA =
  '[role="button"][aria-label="Drop files/folders here, or click to select"]';
// Fixture mods are named after their IDs; an imported mod is not.
const card = (name: string) =>
  `//*[@title="${name}"]/ancestor::*[.//button[@role="switch"]][1]`;

const importNewMod = async (world: string) => {
  const before = (await readLifecycleState(world)).localMods.length;
  await openAddLocalMod();
  await $(DROP_AREA).waitForClickable();
  const uri = pathToFileURL(path.join(world, "fixtures", NEW_MOD_FILE)).href;
  // A dropped file:// path takes the same route as a picked file.
  await browser.execute(
    (selector: string, dropped: string) => {
      const transfer = new DataTransfer();
      transfer.setData("text/uri-list", dropped);
      document.querySelector(selector)?.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    },
    DROP_AREA,
    uri,
  );
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed();
  const add = await dialog.$("button=Add");
  await add.waitForClickable();
  await add.click();
  const state = await observeUntil(
    "new mod added to the library",
    () => readLifecycleState(world),
    (value) => value.localMods.length > before,
  );
  const added = state.localMods.at(-1);
  if (!added) throw new Error("Imported mod is missing from the library");
  await navigate("my-mods");
  await searchLibrary(added.name);
  const toggle = `${card(added.name)}//button[@role="switch"]`;
  await waitForClickable(toggle);
  await $(toggle).click();
  await observeUntil(
    "new mod enabled",
    () => readManifest(world),
    (manifest) => manifest.mods[added.remoteId]?.enabled === true,
  );
  return added;
};

const removeMod = async (
  world: string,
  mod: { remoteId: string; name: string },
) => {
  await searchLibrary(mod.name);
  const remove = `${card(mod.name)}//button[@aria-label="Remove mod"]`;
  await waitForClickable(remove);
  await $(remove).click();
  const confirm = await $('[role="alertdialog"]').$("button=Delete");
  await confirm.waitForClickable();
  await confirm.click();
  await observeUntil(
    "new mod uninstalled",
    () => readManifest(world),
    (manifest) => !(mod.remoteId in manifest.mods),
  );
};

const loadOtherModFirst = async (world: string) => {
  await searchLibrary("");
  // The search re-renders the tabs, so look the tab up again on every try.
  const tab = '//*[@role="tab" and contains(normalize-space(), "Conflicts")]';
  await browser.waitUntil(
    async () => {
      if ((await $(tab).getAttribute("aria-selected")) === "true") return true;
      if (await $(tab).isClickable()) await $(tab).click();
      return false;
    },
    { timeoutMsg: "Conflicts tab never opened" },
  );
  const provider = $(
    `[data-testid="conflict-provider"][data-mod-id="${OTHER_MOD}"]`,
  );
  await provider.waitForDisplayed();
  await provider.$("button=Load first").click();
  await observeUntil(
    "unrelated mods reordered",
    () => readManifest(world),
    (manifest) =>
      (manifest.mods[OTHER_MOD].order ?? Infinity) <
      (manifest.mods[UNRELATED_MOD].order ?? Infinity),
  );
};

describe("compatibility fix persistence", () => {
  it("keeps a fixed mod's repairs through library changes", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    const result = await browser.execute(
      (folder, modId) =>
        window.__TAURI_INTERNALS__.invoke<FixModsResult>("fix_mods", {
          profileFolder: folder,
          modIds: [modId],
        }),
      FIXES.folder,
      FIXED_MOD,
    );
    assert.equal(result.status, "applied");
    const fixed = await readRepairPackage(world);
    assert.ok(fixed.packageExists, "fixing must write the repair package");
    assert.ok(fixed.inGameinfo, "fixing must mount the repair package");

    // Each library change deletes the package; it is rebuilt shortly after.
    const expectRepairsKept = (change: string) =>
      step(`keep repairs after ${change}`, async () => {
        const manifest = await readManifest(world);
        assert.equal(manifest.mods[FIXED_MOD].enabled, true);
        assert.equal(manifest.mods[FIXED_MOD].compatibilityEnabled, true);
        assert.deepEqual(
          await observeUntil(
            `repairs rebuilt after ${change}`,
            () => readRepairPackage(world),
            (repairs) => repairs.packageExists,
          ),
          fixed,
          `${change} must keep the fixed mod's repairs`,
        );
      });

    await setModEnabled(world, UNRELATED_MOD, false);
    await expectRepairsKept("disabling an unrelated mod");
    await setModEnabled(world, UNRELATED_MOD, true);
    await expectRepairsKept("enabling an unrelated mod");
    const added = await step("install a new mod", () => importNewMod(world));
    await expectRepairsKept("installing a new mod");
    await step("uninstall the new mod", () => removeMod(world, added));
    await expectRepairsKept("uninstalling a mod");
    await step("reorder unrelated mods", () => loadOtherModFirst(world));
    await expectRepairsKept("reordering unrelated mods");

    await closeApplication(world, runtime.processId);
  });
});
