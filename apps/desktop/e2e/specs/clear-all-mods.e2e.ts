import assert from "node:assert/strict";
import { access, chmod, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { observeUntil, readPersistedDocument } from "../support/observations";
import {
  DOWNLOAD_FILE,
  DOWNLOAD_MOD,
  DOWNLOAD_NAME,
  QUEUED_MOD,
  QUEUED_NAME,
} from "../support/download-fixtures";
import { stagedBytes } from "../support/download-oracle";
import {
  LOCKED_MOD,
  SHARED_MOD,
  modStorePath,
} from "../support/clear-all-mods-fixtures";
import { ALPHA, ALPHA_MODS, BETA } from "../support/profile-fixtures";
import { openSettings } from "../support/settings-actions";
import { navigate, reveal } from "../support/ui";
import { assertOwnedWorld, collectFileInventory } from "../support/world";

const libraryIds = async (world: string): Promise<string[]> =>
  z
    .object({
      state: z.object({
        localMods: z.array(z.object({ remoteId: z.string() })),
      }),
    })
    .parse(await readPersistedDocument(world))
    .state.localMods.map((mod) => mod.remoteId);

const profileDirectory = async (world: string, folder: string) =>
  path.join(
    (await assertOwnedWorld(world)).configuration.roots.game,
    "game",
    "citadel",
    "addons",
    folder,
  );

/**
 * What a clear must leave empty: the library, Alpha's VPKs and manifest, and
 * the download folders of its mods that no other profile uses.
 */
const readCleared = async (world: string) => {
  const directory = await profileDirectory(world, ALPHA.folder);
  const files = await collectFileInventory(directory);
  const manifest = files[".dmm.json"]
    ? z
        .object({ mods: z.record(z.string(), z.json()) })
        .parse(
          JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
        )
    : { mods: {} };
  const { appData } = (await assertOwnedWorld(world)).configuration.roots;
  const stores: string[] = [];
  for (const modId of ALPHA_MODS)
    if (
      await access(modStorePath(appData, modId)).then(
        () => true,
        () => false,
      )
    )
      stores.push(modId);
  return {
    library: await libraryIds(world),
    vpks: Object.keys(files)
      .filter((file) => file.endsWith(".vpk"))
      .sort(),
    manifestMods: Object.keys(manifest.mods).sort(),
    stores: stores.sort(),
  };
};
const cleared = (stores: string[]) => ({
  library: [],
  vpks: [],
  manifestMods: [],
  stores: stores.sort(),
});

const confirmTool = async (label: string, action: string) => {
  const button = await $(`button=${label}`);
  await reveal(button);
  await button.waitForClickable();
  await button.click();
  const dialog = await $('[role="alertdialog"]');
  await dialog.waitForDisplayed();
  await dialog.$(`button=${action}`).click();
  await expect(dialog).not.toBeDisplayed();
};

const card = (name: string) => $(`[role="button"][aria-label="Open ${name}"]`);
const retry = async (name: string): Promise<void> => {
  const button = await card(name).$("button=Retry");
  await button.waitForClickable();
  await button.click();
};
const backendDownloads = async () =>
  z
    .array(z.object({ modId: z.string(), status: z.string() }))
    .parse(
      await browser.execute(() =>
        window["__TAURI_INTERNALS__"].invoke("get_all_downloads"),
      ),
    );
const downloadRequests = async (world: string) => {
  const origin = (await assertOwnedWorld(world)).configuration.endpoints[0]
    .origin;
  return z
    .object({ requests: z.array(z.object({ url: z.string() })) })
    .parse(await (await fetch(`${origin}/__control/requests`)).json())
    .requests.filter(({ url }) => url === `/downloads/${DOWNLOAD_FILE}`);
};
/** Files the cleared mods still have in the download cache. */
const cachedFiles = async (world: string) => {
  const { roots } = (await assertOwnedWorld(world)).configuration;
  const files: string[] = [];
  for (const modId of [DOWNLOAD_MOD, QUEUED_MOD])
    for (const file of Object.keys(
      await collectFileInventory(path.join(roots.appData, "mods", modId)),
    ))
      files.push(`${modId}/${file}`);
  return files.sort();
};

const clearWhileDownloading = async (world: string, phase: string) => {
  if (phase === "restart-clear-downloading") {
    await navigate("downloads");
    assert.deepEqual(
      {
        library: await libraryIds(world),
        downloads: await backendDownloads(),
        cache: await cachedFiles(world),
      },
      { library: [], downloads: [], cache: [] },
    );
    return;
  }
  await navigate("downloads");
  await step("start one download and queue another behind it", async () => {
    await retry(DOWNLOAD_NAME);
    await observeUntil(
      "Download did not start writing",
      () => stagedBytes(world),
      (bytes) => bytes > 0,
    );
    await retry(QUEUED_NAME);
    await observeUntil(
      "Second download did not enter the backend queue",
      backendDownloads,
      (downloads) =>
        downloads.some(
          ({ modId, status }) => modId === QUEUED_MOD && status === "queued",
        ),
    );
    assert.equal((await downloadRequests(world)).length, 1);
  });
  await openSettings("tools");
  await step("Clear All Mods while they download", async () => {
    await confirmTool("Clear All Mods", "Clear All Mods");
    await expect(
      $(
        '//*[@data-sonner-toast and contains(., "All mods have been cleared")]',
      ),
    ).toBeDisplayed();
  });
  await step("nothing downloads after the clear", async () => {
    // The running transfer alone takes ~16 s at the fixture's pace.
    await observeUntil(
      "Downloads still running after Clear All Mods",
      backendDownloads,
      (downloads) => downloads.length === 0,
      45_000,
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", "cleared-downloads.png"),
    );
    assert.deepEqual(
      { library: await libraryIds(world), cache: await cachedFiles(world) },
      { library: [], cache: [] },
    );
  });
};

describe("Clear All Mods", () => {
  it("leaves nothing a restart can bring back", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    if (
      phase === "clear-downloading" ||
      phase === "restart-clear-downloading"
    ) {
      await clearWhileDownloading(world, phase);
      await closeApplication(world, runtime.processId);
      return;
    }
    assert(
      phase === "clear" ||
        phase === "restart-clear" ||
        phase === "clear-leftover",
    );
    const betaDirectory = await profileDirectory(world, BETA.folder);

    if (phase === "restart-clear") {
      await step("a restart brings nothing back", async () => {
        await navigate("my-mods");
        // Startup restores mods from the manifest shortly after the window is
        // ready; give it time, but stop as soon as a mod reappears.
        const deadline = Date.now() + 8_000;
        let observed = await readCleared(world);
        while (observed.library.length === 0 && Date.now() < deadline) {
          await setTimeout(250);
          observed = await readCleared(world);
        }
        await browser.saveScreenshot(
          path.join(world, "artifacts", "after-restart.png"),
        );
        assert.deepEqual(observed, cleared([SHARED_MOD]));
      });
      await closeApplication(world, runtime.processId);
      return;
    }

    const beta = await collectFileInventory(betaDirectory);
    await navigate("my-mods");
    await observeUntil(
      "Seeded library",
      () => libraryIds(world),
      (ids) => ids.length === ALPHA_MODS.length,
    );
    await openSettings("tools");
    if (phase === "clear") {
      // Staff point users at every button here; Reset forgets the library but
      // keeps the files and the manifest.
      await step("Clear Mods State empties the library", async () => {
        await confirmTool("Clear Mods State", "Clear Mods State");
        await observeUntil(
          "Library after Clear Mods State",
          () => libraryIds(world),
          (ids) => ids.length === 0,
        );
      });
      await step("Clear All Mods removes everything", async () => {
        await confirmTool("Clear All Mods", "Clear All Mods");
        await expect(
          $(
            '//*[@data-sonner-toast and contains(., "All mods have been cleared")]',
          ),
        ).toBeDisplayed();
        await browser.saveScreenshot(
          path.join(world, "artifacts", "cleared.png"),
        );
        assert.deepEqual(await readCleared(world), cleared([SHARED_MOD]));
      });
    } else {
      const locked = modStorePath(
        (await assertOwnedWorld(world)).configuration.roots.appData,
        LOCKED_MOD,
      );
      await step(
        "Clear All Mods names the folder it couldn't delete",
        async () => {
          await confirmTool("Clear All Mods", "Clear All Mods");
          const report = await $('[role="alertdialog"]');
          await report.waitForDisplayed();
          await expect(report).toHaveText(
            expect.stringContaining("Some files couldn't be removed"),
          );
          await expect(report).toHaveText(expect.stringContaining(locked));
          await browser.saveScreenshot(
            path.join(world, "artifacts", "leftover-report.png"),
          );
          await report.$("button=Okay").click();
          await expect(report).not.toBeDisplayed();
          assert.deepEqual(
            await readCleared(world),
            cleared([SHARED_MOD, LOCKED_MOD]),
          );
        },
      );
      await chmod(locked, 0o755);
    }
    await closeApplication(world, runtime.processId);
    assert.deepEqual(
      await collectFileInventory(betaDirectory),
      beta,
      "Clearing the active profile touched another profile",
    );
  });
});
