import { browser } from "@wdio/globals";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { sendDeepLink, visibleToasts } from "../support/deep-link";
import { step } from "../support/evidence";
import { CATALOG_MOD_ID } from "../support/gamebanana-fixtures";
import { observeUntil, readPersistedDocument } from "../support/observations";
import { assertOwnedWorld } from "../support/world";

const readLocalMods = async (world: string) =>
  z
    .object({
      state: z.object({
        localMods: z
          .array(
            z.object({
              remoteId: z.string(),
              status: z.string(),
              installedVpks: z.array(z.string()).optional(),
            }),
          )
          .default([]),
      }),
    })
    .parse(await readPersistedDocument(world)).state.localMods;

const readManifest = async (world: string) => {
  const { configuration } = await assertOwnedWorld(world);
  try {
    return z
      .object({
        mods: z.record(
          z.string(),
          z.object({
            enabled: z.boolean(),
            currentVpks: z.array(z.string()),
            originalVpkNames: z.array(z.string()),
          }),
        ),
      })
      .parse(
        JSON.parse(
          await readFile(
            path.join(
              configuration.roots.game,
              "game",
              "citadel",
              "addons",
              ".dmm.json",
            ),
            "utf8",
          ),
        ),
      );
  } catch {
    return { mods: {} };
  }
};

const waitForInstalled = (world: string, vpks: string[], timeoutMs = 30_000) =>
  step(`wait for ${vpks.join(", ")} to be installed`, () =>
    observeUntil(
      `${vpks.join(", ")} installed`,
      async () => ({
        mod: (await readLocalMods(world)).find(
          (mod) => mod.remoteId === CATALOG_MOD_ID,
        ),
        entry: (await readManifest(world)).mods[CATALOG_MOD_ID],
      }),
      ({ mod, entry }) =>
        mod?.status === "installed" &&
        vpks.every((vpk) => entry?.originalVpkNames.includes(vpk) === true),
      timeoutMs,
    ),
  );

// Sonner removes a toast after a few seconds, so sample them while they last.
const collectToasts = async (durationMs: number): Promise<string[]> => {
  const seen = new Set<string>();
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    for (const text of await visibleToasts()) seen.add(text);
    await setTimeout(200);
  }
  return [...seen];
};

describe("GameBanana 1-click links", () => {
  it("adds another file of an installed mod", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await sendDeepLink(CATALOG_MOD_ID, 910001);
    await waitForInstalled(world, ["base.vpk"]);
    await setTimeout(1_000);
    await sendDeepLink(CATALOG_MOD_ID, 910002);
    const toasts = await collectToasts(3_000);
    await browser.saveScreenshot(
      path.join(world, "artifacts", "deep-link-second-file.png"),
    );
    await writeFile(
      path.join(world, "artifacts", "deep-link-second-file.json"),
      JSON.stringify(
        {
          toasts,
          localMods: await readLocalMods(world),
          manifest: await readManifest(world),
        },
        null,
        2,
      ),
    );
    await waitForInstalled(world, ["base.vpk", "effects.vpk"], 20_000);
    // Both files keep the author's order, as an install from the store would.
    assert.deepEqual(
      (await readManifest(world)).mods[CATALOG_MOD_ID]?.originalVpkNames,
      ["base.vpk", "effects.vpk"],
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", "deep-link-second-file-added.png"),
    );
    // A file the mod already has stays a no-op; the network check sees no
    // second download of it.
    await sendDeepLink(CATALOG_MOD_ID, 910001);
    const repeated = await collectToasts(3_000);
    assert(
      repeated.some((text) => text.includes("is already installed!")),
      `Expected the already-installed notice: ${JSON.stringify(repeated)}`,
    );
    await closeApplication(world, runtime.processId);
  });
});
