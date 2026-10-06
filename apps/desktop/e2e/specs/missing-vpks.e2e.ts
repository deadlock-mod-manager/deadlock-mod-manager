import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { $$, browser } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  ALPHA_MISSING_MODS,
  BETA_MISSING_MODS,
  KEPT_ALPHA_MODS,
  MISSING,
  PARKED_VPK,
  REMOVED_ALPHA_MODS,
  profileDirectory,
} from "../support/missing-vpk-fixtures";
import {
  assertMissingVpkOutcome,
  BROKEN,
  EVERY_MOD,
  holdsLibrary,
  type MissingVpkExpectation,
  readMissingVpkManifest,
  readMissingVpkState,
} from "../support/missing-vpk-oracle";
import { observeUntil } from "../support/observations";
import { ALPHA } from "../support/profile-fixtures";
import { navigate } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

/**
 * Longer than any debounce the detection may use. A mod that is still listed
 * after this long is kept on purpose, not merely not yet noticed.
 */
const SETTLE_MS = 3_000;

/** Alpha mods that lose files in both cases; see the fixture for which ones. */
const DELETED_ALPHA = [
  MISSING.enabled,
  MISSING.parked,
  MISSING.pair,
  MISSING.stored,
];

const PHASES = new Set([
  "detect-offline",
  "restart-offline",
  "detect-live",
  "restart-live",
]);

const AFTER_DELETION: MissingVpkExpectation = {
  alpha: KEPT_ALPHA_MODS,
  beta: BETA_MISSING_MODS,
  broken: BROKEN,
};

const awaitLibrary = (
  world: string,
  label: string,
  expected: MissingVpkExpectation,
) =>
  observeUntil(
    `${label}: library never matched ${JSON.stringify(expected)}`,
    () => readMissingVpkState(world),
    holdsLibrary(expected),
  );

const listed = async (name: string): Promise<boolean> =>
  (await $$(`//main//*[normalize-space()="${name}"]`).length) > 0;

const brokenWarnings = async (): Promise<number> =>
  $$('[data-testid="missing-files-warning"]').length;

/**
 * My Mods renders exactly the expected Alpha mods, by name, and warns on each
 * broken one.
 */
const assertMyMods = (label: string, expected: MissingVpkExpectation) =>
  step(`${label}: My Mods lists ${expected.alpha.join(", ")}`, async () => {
    const warnings = Object.keys(expected.broken).length;
    await browser.waitUntil(
      async () => {
        for (const modId of ALPHA_MISSING_MODS)
          if ((await listed(modId)) !== expected.alpha.includes(modId))
            return false;
        return (await brokenWarnings()) === warnings;
      },
      {
        timeoutMsg: `${label}: My Mods should list only ${expected.alpha} with ${warnings} broken`,
      },
    );
  });

/** Delete a file the way a user would, from outside DMM. */
const deleteAlphaFile = async (world: string, name: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  await rm(path.join(profileDirectory(roots.game, ALPHA.folder), name));
};

/** Reorder through the real Rust command, so DMM itself renames every enabled VPK. */
const reorderAlpha = async (world: string, order: readonly string[]) => {
  const manifest = await readMissingVpkManifest(world, ALPHA.folder);
  const data = order.map(
    (modId, index) => [modId, manifest.mods[modId].currentVpks, index] as const,
  );
  const error = await browser.execute(
    async (folder, modOrderData) => {
      try {
        await window.__TAURI_INTERNALS__.invoke("reorder_mods_by_remote_id", {
          profileFolder: folder,
          modOrderData,
        });
        return null;
      } catch (failure) {
        return JSON.stringify(failure);
      }
    },
    ALPHA.folder,
    data,
  );
  assert.equal(error, null, "Reorder failed");
};

/**
 * DMM stays open and in the foreground the whole time, so nothing but the
 * deletions themselves can prompt it to look at the disk again.
 */
const deleteWhileRunning = async (world: string) => {
  await awaitLibrary(world, "seeded", EVERY_MOD);
  await navigate("my-mods");
  await assertMyMods("seeded", EVERY_MOD);

  await step("DMM's own renames are not deletions", async () => {
    await reorderAlpha(world, [
      MISSING.stored,
      MISSING.pair,
      MISSING.intact,
      MISSING.enabled,
    ]);
    await setTimeout(SETTLE_MS);
    assert.ok(
      holdsLibrary(EVERY_MOD)(await readMissingVpkState(world)),
      "A reorder removed mods from the library",
    );
    await assertMyMods("reordered", EVERY_MOD);
  });

  await step("deleting an enabled mod's only VPK removes the mod", async () => {
    const manifest = await readMissingVpkManifest(world, ALPHA.folder);
    await deleteAlphaFile(world, manifest.mods[MISSING.enabled].currentVpks[0]);
    await awaitLibrary(world, "enabled deleted", {
      alpha: ALPHA_MISSING_MODS.filter((id) => id !== MISSING.enabled),
      beta: BETA_MISSING_MODS,
      broken: {},
    });
  });

  await step(
    "deleting a disabled mod's parked VPK removes the mod",
    async () => {
      await deleteAlphaFile(world, PARKED_VPK);
      await awaitLibrary(world, "parked deleted", {
        alpha: ALPHA_MISSING_MODS.filter(
          (id) => !REMOVED_ALPHA_MODS.includes(id),
        ),
        beta: BETA_MISSING_MODS,
        broken: {},
      });
    },
  );

  await step(
    "deleting part of a mod, or a mod DMM can restore, flags it as broken",
    async () => {
      const manifest = await readMissingVpkManifest(world, ALPHA.folder);
      await deleteAlphaFile(world, manifest.mods[MISSING.pair].currentVpks[1]);
      await deleteAlphaFile(
        world,
        manifest.mods[MISSING.stored].currentVpks[0],
      );
      await awaitLibrary(world, "flagged", AFTER_DELETION);
    },
  );
};

describe("mods with missing VPKs", () => {
  it("drops mods whose files are all gone and flags the ones left broken", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE ?? "";
    const caseId = (await assertOwnedWorld(world)).configuration.caseId;
    if (!PHASES.has(phase)) throw new Error(`Unknown phase for ${caseId}`);

    // Offline, the files were deleted while DMM was closed - including one in
    // the inactive Beta profile - and startup alone has to notice. Live, DMM
    // never restarts before the first check.
    const offline = caseId === "missing-vpks-offline";
    const expected: MissingVpkExpectation = offline
      ? { alpha: KEPT_ALPHA_MODS, beta: [MISSING.betaIntact], broken: BROKEN }
      : AFTER_DELETION;
    const deleted = {
      alpha: DELETED_ALPHA,
      beta: offline ? [MISSING.betaEnabled] : [],
    };

    if (phase === "detect-live") await deleteWhileRunning(world);
    await awaitLibrary(world, phase, expected);
    await navigate("my-mods");
    await assertMyMods(phase, expected);
    await assertMissingVpkOutcome(world, phase, expected, deleted);

    // A removed mod must not come back from the manifest on the next launch.
    await closeApplication(world, runtime.processId);
    await assertMissingVpkOutcome(world, `closed-${phase}`, expected, deleted);
  });
});
