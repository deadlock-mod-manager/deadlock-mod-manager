// Switching away from the Default profile must stop the game loading its VPKs,
// even when gameinfo.gi already mounts the root addons folder outside DMM's
// block (#1401).
import { $, browser, expect } from "@wdio/globals";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { shardSlot } from "../support/filesystem-oracle";
import { observeUntil } from "../support/observations";
import { BETA, BETA_MODS } from "../support/profile-fixtures";
import { readProfileState } from "../support/profile-oracle";
import { DEFAULT_MOD } from "../support/profile-switch-leak-fixtures";
import { readGameinfoSearchPaths, shardPaths } from "../support/shard-oracle";
import { activateProfile, navigate } from "../support/ui";

const ENABLED_VPK = /^pak\d{2}_dir\.vpk$/;
const DEFAULT_VPKS = ["citadel/addons/pak01_dir.vpk"];
const BETA_VPKS = BETA_MODS.map(
  (_, index) => `citadel/addons/${BETA.folder}/${shardSlot(index).filename}`,
);

/** Every enabled VPK the engine would load through gameinfo.gi's addon mounts. */
const loadedVpks = async (world: string): Promise<string[]> => {
  const { citadel } = await shardPaths(world);
  const loaded: string[] = [];
  for (const mount of new Set(await readGameinfoSearchPaths(world))) {
    const entries = await readdir(
      path.join(path.dirname(citadel), mount),
    ).catch(() => []);
    for (const name of entries)
      if (ENABLED_VPK.test(name)) loaded.push(`${mount}/${name}`);
  }
  return loaded.sort();
};

const expectLoaded = (world: string, label: string, expected: string[]) =>
  observeUntil(
    label,
    () => loadedVpks(world),
    (loaded) =>
      loaded.length === expected.length &&
      loaded.every((vpk, index) => vpk === expected[index]),
  );

describe("profile switch isolation", () => {
  it("stops loading the Default profile's mods after switching away", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    await observeUntil(
      "Default's mod is loaded while Default is active",
      () => loadedVpks(world),
      (loaded) => loaded.includes(DEFAULT_VPKS[0]),
    );

    await activateProfile(BETA.name);
    await browser.waitUntil(
      async () => (await readProfileState(world)).activeProfileId === BETA.id,
    );
    await expect($(`[title="${DEFAULT_MOD}"]`)).not.toExist();
    await expectLoaded(world, "only Beta's mods are loaded", BETA_VPKS);

    await activateProfile("Default Profile");
    await browser.waitUntil(
      async () => (await readProfileState(world)).activeProfileId === "default",
    );
    await expectLoaded(world, "only Default's mod is loaded", DEFAULT_VPKS);
    await closeApplication(world, runtime.processId);
  });
});
