import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { heroSkinMods } from "../support/hero-skins-fixtures";
import { observeUntil } from "../support/observations";
import { readSettings } from "../support/settings-actions";
import { navigate, reveal } from "../support/ui";

const CONFLICT = "Multiple skins active";

const heroRow = (hero: string) =>
  $(`//button[.//div[normalize-space()="${hero}"]]`);

const expectSubtitle = (hero: string, subtitle: string) =>
  step(`${hero} reads ${subtitle}`, async () => {
    const row = await heroRow(hero);
    await reveal(row);
    await expect(row).toHaveText(expect.stringContaining(subtitle));
    if (subtitle !== CONFLICT)
      await expect(row).not.toHaveText(expect.stringContaining(CONFLICT));
  });

const openHero = (hero: string) =>
  step(`open ${hero}`, async () => {
    const row = await heroRow(hero);
    await reveal(row);
    await row.click();
    await expect($(`h2=${hero}`)).toBeDisplayed();
  });

const card = (name: string) =>
  $(`//*[@role="button" and .//div[normalize-space()="${name}"]]`);

/** The grid marks exactly one card - the default or a skin - as worn. */
const expectOnlyActive = (name: string) =>
  step(`only ${name} is active`, async () => {
    await expect(card(name)).toHaveAttribute("aria-pressed", "true");
    await browser.waitUntil(
      async () =>
        (await $$('[role="button"][aria-pressed="true"]').length) === 1,
      { timeoutMsg: `Expected ${name} to be the only active card` },
    );
  });

const readStatuses = async (world: string) =>
  Object.fromEntries(
    z
      .array(z.object({ remoteId: z.string(), status: z.string() }))
      .parse((await readSettings(world)).localMods)
      .map((mod) => [mod.remoteId, mod.status]),
  );

describe("hero skin active state", () => {
  it("only flags heroes that really wear several skins", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const { talon, hazeOne, hazeTwo } = heroSkinMods;
    await navigate("skins");

    // One skin installed from two archives is still one skin (#686).
    await expectSubtitle("Grey Talon", talon.name);
    await openHero("Grey Talon");
    await expectOnlyActive(talon.name);

    // Two separate skins on one hero is the conflict the warning is for.
    await expectSubtitle("Haze", CONFLICT);
    await openHero("Haze");
    await (await card(hazeOne.name)).click();
    await observeUntil(
      "Picking one Haze skin switched the other off",
      () => readStatuses(world),
      (statuses) =>
        statuses[hazeOne.id] === "installed" &&
        statuses[hazeTwo.id] !== "installed",
    );
    await expectOnlyActive(hazeOne.name);
    await expectSubtitle("Haze", hazeOne.name);

    await browser.saveScreenshot(
      path.join(world, "artifacts", "hero-skins.png"),
    );
    await closeApplication(world, runtime.processId);
  });
});
