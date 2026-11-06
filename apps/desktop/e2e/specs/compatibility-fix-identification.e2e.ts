import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  IDENTIFY,
  PLACEHOLDER_MOD,
} from "../support/compatibility-fix-identification-fixtures";
import { step } from "../support/evidence";
import {
  CATALOG_MOD_ID,
  CATALOG_MOD_NAME,
} from "../support/gamebanana-fixtures";
import { observeUntil } from "../support/observations";
import { searchLibrary } from "../support/shard-actions";
import { navigate, waitForOverlaysClosed } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      compatibilityEnabled: z.boolean().optional(),
      compatibilityOptedOut: z.boolean().optional(),
    }),
  ),
});

type HealthReport = { mods: { modId: string; status: string }[] };

const citadelOf = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return path.join(roots.game, "game", "citadel");
};

const readManifest = async (world: string) =>
  manifestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(
          await citadelOf(world),
          "addons",
          IDENTIFY.folder,
          ".dmm.json",
        ),
        "utf8",
      ),
    ),
  );

const readHealth = async (): Promise<Record<string, string>> => {
  const report = await browser.execute(
    (profileFolder) =>
      // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
      window.__TAURI_INTERNALS__.invoke<HealthReport>("get_mod_health", {
        profileFolder,
      }),
    IDENTIFY.folder,
  );
  return Object.fromEntries(
    report.mods.map((health) => [health.modId, health.status]),
  );
};

// Mirrors `localization_overlay_search_path`: the first 8 bytes of the folder
// name's SHA-256.
const OVERLAY = `dmm_localization_${createHash("sha256")
  .update(IDENTIFY.folder)
  .digest("hex")
  .slice(0, 16)}`;

const receiptSchema = z.object({
  data_repairs: z.array(z.object({ modId: z.string() })),
});

/** What a game started from Steam would load for the profile. */
const readRepairs = async (world: string) => {
  const citadel = await citadelOf(world);
  const raw = await readFile(
    path.join(citadel, OVERLAY, "compatibility.json"),
    "utf8",
  ).catch(() => null);
  const gameinfo = await readFile(path.join(citadel, "gameinfo.gi"), "utf8");
  return {
    packageExists: await readFile(path.join(citadel, OVERLAY, "pak01_dir.vpk"))
      .then(() => true)
      .catch(() => false),
    repairedMods: raw
      ? [
          ...new Set(
            receiptSchema
              .parse(JSON.parse(raw))
              .data_repairs.map((repair) => repair.modId),
          ),
        ].sort()
      : [],
    mounted: gameinfo
      .split("\n")
      .some(
        (line) =>
          line.trim().split(/\s+/).join(" ") === `Game citadel/${OVERLAY}`,
      ),
  };
};

const card = (name: string) =>
  `//*[@title="${name}"]/ancestor::*[.//button[@role="switch"]][1]`;

const badgeStatus = async (name: string) => {
  await navigate("my-mods");
  await searchLibrary(name);
  const badge = await $(`${card(name)}//*[@data-testid="mod-health-badge"]`);
  return (await badge.isExisting())
    ? await badge.getAttribute("data-status")
    : null;
};

const fixInDialog = async (modId: string) => {
  await navigate("my-mods");
  const details = await $('[data-testid="mod-health-banner"]').$(
    "button=See details",
  );
  await details.waitForClickable({ timeout: 30_000 });
  await details.click();
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed();
  const fix = await dialog
    .$(`//*[@data-testid="mod-health-row"][.//button[@title="${modId}"]]`)
    .$("button=Fix");
  await fix.waitForClickable();
  await fix.click();
};

const waitForStatus = (modId: string, status: string) =>
  observeUntil(
    `${modId} reads ${status}`,
    readHealth,
    (health) => health[modId] === status,
    60_000,
  );

describe("compatibility fix identification", () => {
  it("keeps a fixed mod fixed when Analyze identifies it", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await step("fix the hand-added mod", async () => {
      await waitForStatus(PLACEHOLDER_MOD, "fixable");
      await fixInDialog(PLACEHOLDER_MOD);
      await waitForStatus(PLACEHOLDER_MOD, "fixed");
      await browser.keys("Escape");
      await waitForOverlaysClosed();
      const repairs = await observeUntil(
        "placeholder repair packaged",
        () => readRepairs(world),
        (state) =>
          state.packageExists && state.repairedMods.includes(PLACEHOLDER_MOD),
      );
      assert.ok(repairs.mounted, "fixing must mount the repair package");
    });

    const identified = await step("Analyze identifies the mod", async () => {
      await navigate("my-mods");
      await searchLibrary("");
      await $('button[aria-label="More actions"]').click();
      await browser.keys("ArrowDown");
      await $('[role="menuitem"]=Analyze Local Addons').click();
      const manifest = await observeUntil(
        "placeholder replaced with its catalog identity",
        () => readManifest(world),
        (state) =>
          CATALOG_MOD_ID in state.mods && !(PLACEHOLDER_MOD in state.mods),
      );
      assert.deepEqual(Object.keys(manifest.mods), [CATALOG_MOD_ID]);
      // The choice as saved by the registration itself, before any refresh.
      return manifest.mods[CATALOG_MOD_ID];
    });

    await step("the identified mod stays fixed", async () => {
      // Analyze clears the repair package; the refresh rebuilds it.
      const settled = await observeUntil(
        "identified mod fixed and its repair rebuilt",
        async () => ({
          health: (await readHealth())[CATALOG_MOD_ID],
          repairs: await readRepairs(world),
        }),
        ({ health, repairs }) =>
          health === "fixed" &&
          repairs.packageExists &&
          repairs.repairedMods.includes(CATALOG_MOD_ID),
        60_000,
      ).catch(() => null);
      const observed = {
        choice: (await readManifest(world)).mods[CATALOG_MOD_ID],
        health: (await readHealth())[CATALOG_MOD_ID],
        repairs: await readRepairs(world),
        // The card follows the report once the window refetches it.
        badge: await observeUntil(
          "library card reads Fixed for this patch",
          () => badgeStatus(CATALOG_MOD_NAME),
          (status) => status === "fixed",
          settled ? 15_000 : 0,
        ).catch(() => badgeStatus(CATALOG_MOD_NAME)),
      };
      assert.deepEqual(
        identified,
        {
          enabled: true,
          compatibilityEnabled: true,
          compatibilityOptedOut: false,
        },
        `identification must keep the Fix choice; then saw ${JSON.stringify(observed)}`,
      );
      assert.deepEqual(observed, {
        choice: identified,
        health: "fixed",
        repairs: {
          packageExists: true,
          repairedMods: [CATALOG_MOD_ID],
          mounted: true,
        },
        badge: "fixed",
      });
    });

    await closeApplication(world, runtime.processId);
  });
});
