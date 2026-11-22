import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { $, $$, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  commandReplyHeld,
  holdCommandReply,
  releaseCommandReply,
} from "../support/command-hold";
import { selectMods } from "../support/library-groups-actions";
import {
  fingerprint,
  inventorySchema,
  observeUntil,
  readPersistedDocument,
} from "../support/observations";
import {
  ALPHA,
  ALPHA_MODS,
  BETA,
  profilePayload,
} from "../support/profile-fixtures";
import { navigate } from "../support/ui";
import { assertOwnedWorld, collectFileInventory } from "../support/world";

const [first, second, third] = ALPHA_MODS;
// Exists only to make the second mod's delete fail before any of its files move.
const STAGING_BLOCKER = `.dmm-update-${second}`;
const STAGING_BYTES = Buffer.from("Owned staging blocker\n");

const manifestEntrySchema = z
  .object({
    enabled: z.boolean(),
    currentVpks: z.array(z.string()),
    disabledVpks: z.array(z.string()),
    originalVpkNames: z.array(z.string()),
  })
  .loose();
const manifestSchema = z
  .object({ mods: z.record(z.string(), manifestEntrySchema) })
  .loose();
const stateSchema = z.object({
  state: z.object({
    localMods: z.array(z.object({ remoteId: z.string(), status: z.string() })),
  }),
});

const addonsDirectory = async (world: string, folder: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return path.join(roots.game, "game", "citadel", "addons", folder);
};
const readManifest = async (directory: string) =>
  manifestSchema.parse(
    JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
  );
const writeManifest = async (
  directory: string,
  manifest: z.infer<typeof manifestSchema>,
) =>
  writeFile(
    path.join(directory, ".dmm.json"),
    JSON.stringify(manifest, null, 2),
  );

/** Makes the second mod's disable fail before it renames anything. */
const breakSecondDisable = async (directory: string) => {
  const manifest = await readManifest(directory);
  const entry = manifest.mods[second];
  assert.ok(entry, "the second mod must start in the manifest");
  manifest.mods[second] = {
    ...entry,
    originalVpkNames: [`${second}.vpk`, "extra.vpk"],
  };
  await writeManifest(directory, manifest);
};

const libraryStatuses = async (world: string) =>
  Object.fromEntries(
    stateSchema
      .parse(await readPersistedDocument(world))
      .state.localMods.map((mod) => [mod.remoteId, mod.status]),
  );

const expectLibrary = async (world: string, expected: Record<string, string>) =>
  observeUntil(
    "library state persisted",
    () => libraryStatuses(world),
    (actual) => isDeepStrictEqual(actual, expected),
  );

const expectFiles = async (
  directory: string,
  expected: Record<string, Buffer>,
) => {
  const inventory = await collectFileInventory(directory);
  const { [".dmm.json"]: manifestHash, ...files } = inventory;
  assert.ok(manifestHash, "the profile manifest must survive");
  assert.deepEqual(
    files,
    Object.fromEntries(
      Object.entries(expected).map(([name, bytes]) => [
        name,
        fingerprint(bytes),
      ]),
    ),
  );
};

const verifyDisableOutcome = async (world: string) => {
  const directory = await addonsDirectory(world, ALPHA.folder);
  await expectLibrary(world, {
    [first]: "downloaded",
    [second]: "installed",
    [third]: "installed",
  });
  const manifest = await readManifest(directory);
  assert.deepEqual(
    {
      enabled: manifest.mods[first]?.enabled,
      currentVpks: manifest.mods[first]?.currentVpks,
      disabledVpks: manifest.mods[first]?.disabledVpks,
    },
    {
      enabled: false,
      currentVpks: [],
      disabledVpks: [`${first}_${first}.vpk`],
    },
  );
  for (const [id, vpk] of [
    [second, "pak02_dir.vpk"],
    [third, "pak03_dir.vpk"],
  ]) {
    assert.equal(manifest.mods[id]?.enabled, true);
    assert.deepEqual(manifest.mods[id]?.currentVpks, [vpk]);
  }
  await expectFiles(directory, {
    [`${first}_${first}.vpk`]: profilePayload(first),
    "pak02_dir.vpk": profilePayload(second),
    "pak03_dir.vpk": profilePayload(third),
    "protected.txt": Buffer.from(`Protected ${ALPHA.name}\n`),
  });
};

const verifyDeleteOutcome = async (world: string) => {
  const directory = await addonsDirectory(world, ALPHA.folder);
  await expectLibrary(world, {
    [second]: "installed",
    [third]: "installed",
  });
  const manifest = await readManifest(directory);
  assert.deepEqual(Object.keys(manifest.mods).sort(), [second, third].sort());
  for (const [id, vpk] of [
    [second, "pak02_dir.vpk"],
    [third, "pak03_dir.vpk"],
  ]) {
    assert.equal(manifest.mods[id]?.enabled, true);
    assert.deepEqual(manifest.mods[id]?.currentVpks, [vpk]);
  }
  await expectFiles(directory, {
    [STAGING_BLOCKER]: STAGING_BYTES,
    "pak02_dir.vpk": profilePayload(second),
    "pak03_dir.vpk": profilePayload(third),
    "protected.txt": Buffer.from(`Protected ${ALPHA.name}\n`),
  });
};

const verifyBetaUntouched = async (world: string) => {
  const initial = z
    .object({ beta: inventorySchema })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "profiles-initial.json"),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(
    await collectFileInventory(await addonsDirectory(world, BETA.folder)),
    initial.beta,
  );
};

const recapSection = (heading: string) =>
  $(`//section[.//h3[normalize-space()="${heading}"]]`);

const expectRecap = async (
  world: string,
  headings: { failed: string; completed: string },
  failure: string,
) => {
  const recap = $('[role="dialog"]');
  await recap.waitForDisplayed();
  await browser.saveScreenshot(
    path.join(world, "artifacts", "bulk-failure-recap.png"),
  );
  const failed = recapSection(`${headings.failed} (1)`);
  await expect(failed).toHaveText(expect.stringContaining(second));
  await expect(failed).toHaveText(expect.stringContaining(failure));
  await expect(recapSection("Not attempted (1)")).toHaveText(
    expect.stringContaining(third),
  );
  await expect(recapSection(`${headings.completed} (1)`)).toHaveText(
    expect.stringContaining(first),
  );
  // The recap replaces the generic error toast rather than adding to it.
  await expect(
    $$('[data-sonner-toast][data-type="error"]'),
  ).toBeElementsArrayOfSize(0);
  await recap.$("button=Close").click();
  await expect(recap).not.toBeDisplayed();
};

const confirmWhileOpen = async (
  action: string,
  inject: () => Promise<void>,
) => {
  const dialog = $('[role="alertdialog"]');
  await dialog.waitForDisplayed();
  // Fault injection waits for the confirmation so startup can't repair it.
  await inject();
  await dialog.$(`button=${action}`).click();
  await expect(dialog).not.toBeDisplayed();
};

const texts = async (selector: string) => {
  const found: string[] = [];
  for (const element of await $$(selector)) found.push(await element.getText());
  return found;
};

/** Saves what the user sees right after the run, for base and fixed runs alike. */
const recordOutcome = async (world: string) => {
  await browser.pause(1_000);
  const toasts = await texts("[data-sonner-toast]");
  const dialogs = await texts('[role="dialog"]');
  await writeFile(
    path.join(world, "artifacts", "bulk-failure-outcome.json"),
    JSON.stringify({ toasts, dialogs }, null, 2),
  );
  await browser.saveScreenshot(
    path.join(world, "artifacts", "bulk-failure-outcome.png"),
  );
};

describe("bulk library actions stopped by a failure", () => {
  it("say which mods changed, which failed and which were not attempted", async () => {
    const caseId = z
      .enum([
        "library-bulk-disable-failure",
        "library-bulk-delete-failure",
        "library-bulk-disable-away",
      ])
      .parse(process.env.DMM_E2E_CASE_ID);
    const disabling = caseId !== "library-bulk-delete-failure";
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const alpha = await addonsDirectory(world, ALPHA.folder);
    await navigate("my-mods");

    if (process.env.DMM_E2E_PHASE === "fail") {
      await selectMods(ALPHA_MODS);
      if (disabling) {
        await $("button=Disable 3").click();
        await confirmWhileOpen("Disable selected", () =>
          breakSecondDisable(alpha),
        );
      } else {
        await $('button[aria-label="More selection actions"]').click();
        await browser.keys("ArrowDown");
        await $('[role="menuitem"]=Delete 3').click();
        await confirmWhileOpen("Delete", () =>
          writeFile(path.join(alpha, STAGING_BLOCKER), STAGING_BYTES),
        );
      }
      // The partial outcome is real before anything is said about it.
      if (disabling) await verifyDisableOutcome(world);
      else await verifyDeleteOutcome(world);
      await recordOutcome(world);
      if (disabling)
        await expectRecap(
          world,
          { failed: "Failed to disable", completed: "Disabled" },
          "original VPK name count (2) does not match installed VPK count (1)",
        );
      else
        await expectRecap(
          world,
          { failed: "Failed to delete", completed: "Deleted" },
          `stale staging exists at`,
        );
    }

    if (process.env.DMM_E2E_PHASE === "away") {
      await selectMods(ALPHA_MODS);
      await $("button=Disable 3").click();
      await confirmWhileOpen("Disable selected", async () => {
        await breakSecondDisable(alpha);
        await holdCommandReply("uninstall_mod", second);
      });
      // The run is waiting on the second mod when the library page goes away.
      await observeUntil("second disable held", commandReplyHeld, Boolean);
      await navigate("settings");
      await releaseCommandReply();
      await verifyDisableOutcome(world);
      await recordOutcome(world);
      await expectRecap(
        world,
        { failed: "Failed to disable", completed: "Disabled" },
        "original VPK name count (2) does not match installed VPK count (1)",
      );
      // A closed recap stays closed when the library opens again.
      await navigate("my-mods");
    }

    if (disabling) await verifyDisableOutcome(world);
    else await verifyDeleteOutcome(world);
    await verifyBetaUntouched(world);
    await expect($('[role="dialog"]')).not.toBeExisting();
    await closeApplication(world, runtime.processId);
  });
});
