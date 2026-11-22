import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  analysisCard,
  readLibraryIds,
} from "../support/analysis-library-status-fixtures";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { CATALOG_MOD_ID } from "../support/gamebanana-fixtures";
import { waitForDisplayed } from "../support/ui";

const next = () => $("button=Next");

describe("onboarding analysis of an identified addon", () => {
  it("doesn't claim it added a mod it only identified", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const addonPath = path.join(
      world,
      "game-install",
      "game",
      "citadel",
      "addons",
      "pak01_dir.vpk",
    );
    const originalAddon = await readFile(addonPath);

    await step("reach existing mods through setup", async () => {
      await $("#acknowledge-disclaimer").click();
      for (const title of [
        "Game Path Detection",
        "API Connection",
        "Download Server",
        "Existing Mods",
      ]) {
        await browser.waitUntil(() => next().isEnabled());
        await next().click();
        await waitForDisplayed(`h3=${title}`);
      }
      await waitForDisplayed("button=Analyze Mods");
    });

    await step(
      "analysis lists the identified mod as not in the library",
      async () => {
        await $("button=Analyze Mods").click();
        const card = analysisCard("pak01_dir.vpk");
        await waitForDisplayed(card);
        // Without mod details in the match, the card names the mod by its id.
        await expect($(card)).toHaveText(
          expect.stringContaining(CATALOG_MOD_ID),
        );
        await browser.saveScreenshot(
          path.join(world, "artifacts", "onboarding-analysis.png"),
        );
        await expect($(card)).toHaveText(
          expect.stringContaining("Not in Library"),
        );
        await expect($(card)).not.toHaveText(
          expect.stringContaining("Added to Library"),
        );
        await browser.keys("Escape");
        await waitForDisplayed("button=Skip for Now");
      },
    );

    await step("the step doesn't promise to import", async () => {
      const description = await $(
        "//p[contains(normalize-space(), 'run Analyze in My Mods after setup')]",
      );
      await expect(description).toBeDisplayed();
      await expect(description).not.toHaveText(
        expect.stringContaining("import"),
      );
    });

    await step("finish setup", async () => {
      await $("button=Skip for Now").click();
      await waitForDisplayed("#telemetry-consent-switch");
      await $("button=Skip Setup").click();
    });

    await closeApplication(world, runtime.processId);
    const library = await readLibraryIds(world, "default");
    assert.ok(!library.active.includes(CATALOG_MOD_ID));
    assert.ok(!library.profile.includes(CATALOG_MOD_ID));
    assert.deepEqual(await readFile(addonPath), originalAddon);
  });
});
