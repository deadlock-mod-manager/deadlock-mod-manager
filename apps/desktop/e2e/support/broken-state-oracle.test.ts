import assert from "node:assert/strict";
import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { it } from "bun:test";
import {
  damageClosedWorld,
  prepareBrokenStateWorld,
  brokenProfileDirectory,
} from "./broken-state-fixtures";
import {
  assertDisabledBrokenLaunchState,
  assertEnabledBrokenPayloads,
  assertRemovedBrokenState,
  hasMissingEnabledFiles,
  readBrokenLaunches,
  readBrokenState,
} from "./broken-state-oracle";
import { createWorld, removeOwnedWorld } from "./world";

it("observes launches only after their newline is appended", async () => {
  const world = await createWorld({
    runId: "partial-launch-journal",
    caseId: "gameinfo-reverted-launch",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43210",
  });
  try {
    const journal = path.join(
      world.directory,
      "artifacts",
      "game-launches.ndjson",
    );
    const first = {
      program: "C:\\Steam\\steam.exe",
      uri: "steam://run/1422450//",
    };
    const second = { ...first, uri: "steam://run/1422450//-condebug" };
    const firstLine = JSON.stringify(first);
    const secondLine = JSON.stringify(second);
    assert.deepEqual(await readBrokenLaunches(world.directory), []);
    await writeFile(journal, firstLine.slice(0, 41));
    assert.deepEqual(await readBrokenLaunches(world.directory), []);
    await appendFile(journal, firstLine.slice(41));
    assert.deepEqual(await readBrokenLaunches(world.directory), []);
    await appendFile(journal, "\n");
    assert.deepEqual(await readBrokenLaunches(world.directory), [first]);
    for (let length = 1; length <= secondLine.length; length++) {
      await writeFile(journal, `${firstLine}\n${secondLine.slice(0, length)}`);
      assert.deepEqual(await readBrokenLaunches(world.directory), [first]);
    }
    await appendFile(journal, "\n");
    assert.deepEqual(await readBrokenLaunches(world.directory), [
      first,
      second,
    ]);
    await writeFile(journal, `${firstLine}\r\n${secondLine}\r\n`);
    assert.deepEqual(await readBrokenLaunches(world.directory), [
      first,
      second,
    ]);
    await writeFile(journal, "{\n");
    await assert.rejects(readBrokenLaunches(world.directory), SyntaxError);
    await writeFile(journal, JSON.stringify({ program: first.program }) + "\n");
    await assert.rejects(readBrokenLaunches(world.directory), {
      name: "ZodError",
    });
  } finally {
    await removeOwnedWorld(world.directory);
  }
});

it("requires disabled store and manifest entries, empty enabled files, and exactly one launch", async () => {
  const world = await createWorld({
    runId: "disabled-launch-oracle",
    caseId: "missing-vpks-launch",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43210",
  });
  try {
    await prepareBrokenStateWorld(world);
    const observation = await readBrokenState(world.directory);
    for (const mod of observation.state.localMods) {
      mod.status = "downloaded";
      observation.state.profiles[observation.state.activeProfileId].enabledMods[
        mod.remoteId
      ].enabled = false;
      const entry = observation.manifest?.mods[mod.remoteId];
      assert(entry);
      entry.enabled = false;
      entry.currentVpks = [];
      mod.installedVpks = [];
    }
    observation.state.profiles[observation.state.activeProfileId].mods =
      observation.state.localMods;
    observation.disk = {
      ".dmm.json": observation.disk[".dmm.json"],
      "protected.txt": observation.disk["protected.txt"],
    };
    observation.launches = [{ program: "steam", uri: "steam://run/1422450//" }];
    assertDisabledBrokenLaunchState(observation);
    const reconciled = structuredClone(observation);
    reconciled.state.profiles[reconciled.state.activeProfileId].enabledMods =
      {};
    assertDisabledBrokenLaunchState(reconciled);
    const enabledStore = structuredClone(observation);
    enabledStore.state.profiles[enabledStore.state.activeProfileId].enabledMods[
      enabledStore.state.localMods[0].remoteId
    ].enabled = true;
    assert.throws(() => assertDisabledBrokenLaunchState(enabledStore));
    const missingSentinel = structuredClone(observation);
    delete missingSentinel.disk["protected.txt"];
    assert.throws(() => assertDisabledBrokenLaunchState(missingSentinel));
    assert.throws(() =>
      assertDisabledBrokenLaunchState({
        ...observation,
        disk: { ...observation.disk, "protected.txt": "wrong bytes" },
      }),
    );
    assert.throws(() =>
      assertDisabledBrokenLaunchState({
        ...observation,
        disk: { ...observation.disk, "unexpected.vpk": "unexpected payload" },
      }),
    );
    const enabled = structuredClone(observation);
    const entry = enabled.manifest?.mods[enabled.state.localMods[0].remoteId];
    assert(entry);
    entry.enabled = true;
    assert.throws(() => assertDisabledBrokenLaunchState(enabled));
    assert.throws(() =>
      assertDisabledBrokenLaunchState({ ...observation, launches: [] }),
    );
    assert.throws(() =>
      assertDisabledBrokenLaunchState({ ...observation, gameinfo: "vanilla" }),
    );
  } finally {
    await removeOwnedWorld(world.directory);
  }
}, 30_000);

it("rejects a healthy store and manifest when launch payloads are missing or corrupt", async () => {
  const world = await createWorld({
    runId: "broken-launch-oracle",
    caseId: "missing-vpks-launch",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43210",
  });
  try {
    await prepareBrokenStateWorld(world);
    const intact = await readBrokenState(world.directory);
    assertEnabledBrokenPayloads(intact);
    assert.equal(hasMissingEnabledFiles(intact), false);
    await writeFile(
      path.join(
        brokenProfileDirectory(world.configuration.roots.game),
        "pak01_dir.vpk",
      ),
      "Wrong bytes",
    );
    const corrupt = await readBrokenState(world.directory);
    assert.throws(() => assertEnabledBrokenPayloads(corrupt));
    await damageClosedWorld(world.directory, "vpks");
    const missing = await readBrokenState(world.directory);
    assert.deepEqual(missing.state, intact.state);
    assert.deepEqual(missing.manifest, intact.manifest);
    assert.deepEqual(missing.modsStore, intact.modsStore);
    assert.equal(hasMissingEnabledFiles(missing), true);
    assert.throws(() => assertEnabledBrokenPayloads(missing));
  } finally {
    await removeOwnedWorld(world.directory);
  }
}, 30_000);

it("distinguishes a wiped folder from a vanilla gameinfo without altering neighbouring files", async () => {
  const world = await createWorld({
    runId: "broken-folder-oracle",
    caseId: "addons-folder-wiped",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43210",
  });
  try {
    await prepareBrokenStateWorld(world);
    const initial = await readBrokenState(world.directory);
    await damageClosedWorld(world.directory, "gameinfo");
    const vanilla = await readBrokenState(world.directory);
    assert.doesNotMatch(vanilla.gameinfo, /Game\s+citadel\/addons/);
    assert.deepEqual(vanilla.disk, initial.disk);
    await damageClosedWorld(world.directory, "folder");
    const wiped = await readBrokenState(world.directory);
    assert.equal(wiped.manifest, null);
    assert.deepEqual(wiped.disk, {});
    assert.deepEqual(wiped.state, initial.state);
    assert.deepEqual(wiped.beta, initial.beta);
    assert.deepEqual(wiped.steam, initial.steam);
    assert.throws(() => assertRemovedBrokenState(wiped));
    const removed = structuredClone(wiped);
    removed.state.localMods = [];
    removed.state.profiles[removed.state.activeProfileId].mods = [];
    removed.state.profiles[removed.state.activeProfileId].enabledMods = {};
    assertRemovedBrokenState(removed);
    assert.throws(() =>
      assertRemovedBrokenState({
        ...removed,
        disk: { "unexpected.vpk": "stale payload" },
      }),
    );
    const staleEnabled = structuredClone(removed);
    staleEnabled.state.profiles[removed.state.activeProfileId].enabledMods =
      initial.state.profiles[initial.state.activeProfileId].enabledMods;
    assert.throws(() => assertRemovedBrokenState(staleEnabled));
  } finally {
    await removeOwnedWorld(world.directory);
  }
}, 30_000);
