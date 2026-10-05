import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { installCatalog } from "../support/catalog-actions";
import { step } from "../support/evidence";
import {
  catalogRecipe,
  CATALOG_MOD_ID,
  CATALOG_MOD_NAME,
  UPDATE_SKIP_DATES,
} from "../support/gamebanana-fixtures";
import {
  assertCatalogDisk,
  readCatalogState,
} from "../support/gamebanana-oracle";
import { observeUntil } from "../support/observations";
import { navigate, reveal } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const phases = [
  "optional-file",
  "skip-update",
  "restart-skipped",
  "newer-update",
] as const;
const UPDATES_BUTTON = "button=1 update available";
const toast = (text: string) =>
  $(`//*[@data-sonner-toast and contains(., "${text}")]`);

// The app caches update checks for six hours. Expiring the cache between
// processes stands in for that time passing, so the next check sees the
// author's next change.
const expireUpdateCache = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const catalog = new DatabaseSync(
    path.join(roots.appData, "gamebanana-catalog.db"),
  );
  try {
    const { changes } = catalog
      .prepare("UPDATE update_cache SET checked_at = 0")
      .run();
    assert.equal(changes, 1);
  } finally {
    catalog.close();
  }
};

const expectUpdates = (count: 0 | 1) =>
  step(`check for updates: ${count} available`, async () => {
    await navigate("my-mods");
    const check = await $("button=Check for updates");
    // Wait for any automatic check to finish so a manual one cannot race it.
    await check.waitForEnabled({ timeout: 30_000 });
    await check.click();
    await expect(
      toast(count ? "1 update available" : "All mods are up to date"),
    ).toBeDisplayed({ wait: 30_000 });
    if (count) await expect($(UPDATES_BUTTON)).toBeDisplayed();
    else await expect($(UPDATES_BUTTON)).not.toBeDisplayed();
  });

const expectModPage = (hasUpdate: boolean) =>
  step(`mod page ${hasUpdate ? "offers" : "hides"} the update`, async () => {
    await navigate("mods");
    await $(`[title="${CATALOG_MOD_NAME}"]`).click();
    const action = await $(
      hasUpdate ? "button=Update Mod" : "button=Force Update",
    );
    await reveal(action);
    await expect(
      $(hasUpdate ? "button=Force Update" : "button=Update Mod"),
    ).not.toBeDisplayed();
    const changelogDot = $('[role="img"][aria-label="Update available"]');
    if (hasUpdate) await expect(changelogDot).toBeDisplayed();
    else await expect(changelogDot).not.toBeDisplayed();
  });

describe("skipping mod updates", () => {
  it("hides a skipped update until the installed file changes again", async () => {
    const scenario = process.env.DMM_E2E_CASE_ID ?? "";
    const phase = z.enum(phases).parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "update-skip.json");
    const skippedUpdateAt = async () =>
      (await readCatalogState(world)).localMods[0]?.skippedUpdateAt;

    if (phase === "optional-file") {
      await navigate("mods");
      await $(`[title="${CATALOG_MOD_NAME}"]`).click();
      await installCatalog(world, scenario, ["base.vpk"]);
      const [installed] = catalogRecipe(scenario);
      assert.deepEqual(
        (await readCatalogState(world)).localMods[0].selectedDownloads.map(
          (download) => download.url,
        ),
        [`gamebanana-file://${CATALOG_MOD_ID}/${installed.id}`],
      );
      // The author added a newer optional file the user never installed.
      await expectUpdates(0);
      await expectModPage(false);
    } else {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, previous.processId);
    }

    if (phase === "skip-update") {
      // The installed file was updated.
      await expectUpdates(1);
      await expectModPage(true);
      await step("skip the update", async () => {
        await navigate("my-mods");
        await $(UPDATES_BUTTON).click();
        const dialog = await $('[role="dialog"]');
        await expect(dialog).toHaveText(
          expect.stringContaining(CATALOG_MOD_NAME),
        );
        await dialog.$("button=Skip this update").click();
        await expect(dialog).not.toBeDisplayed();
        await expect(
          toast(`Skipped the update for ${CATALOG_MOD_NAME}`),
        ).toBeDisplayed();
        await observeUntil(
          "Persisted skipped update",
          skippedUpdateAt,
          (value) => value === UPDATE_SKIP_DATES.updatedFile,
        );
        await expect($(UPDATES_BUTTON)).not.toBeDisplayed();
      });
      await expectUpdates(0);
      await expectModPage(false);
    } else if (phase === "restart-skipped") {
      assert.equal(await skippedUpdateAt(), UPDATE_SKIP_DATES.updatedFile);
      await expectUpdates(0);
      await expectModPage(false);
    } else if (phase === "newer-update") {
      // The author updated the installed file again after the skipped update.
      assert.equal(await skippedUpdateAt(), UPDATE_SKIP_DATES.updatedFile);
      await expectUpdates(1);
      await expectModPage(true);
    }

    await writeFile(
      checkpoint,
      JSON.stringify({ processId: runtime.processId }),
    );
    await browser.saveScreenshot(path.join(world, "artifacts", `${phase}.png`));
    await writeFile(
      path.join(world, "artifacts", `${phase}.html`),
      await browser.getPageSource(),
    );
    await closeApplication(world, runtime.processId);
    await assertCatalogDisk(world, scenario, `closed-${phase}`);
    if (phase === "optional-file" || phase === "restart-skipped")
      await expireUpdateCache(world);
  });
});
