import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import {
  analysisCard,
  PROFILE_PAGE,
  readLibraryIds,
  RESTORE_METADATA_HOLD,
} from "../support/analysis-library-status-fixtures";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { CATALOG_MOD_ID } from "../support/gamebanana-fixtures";
import { observeUntil } from "../support/observations";
import { ALPHA, BETA } from "../support/profile-fixtures";
import { openSettings } from "../support/settings-actions";
import {
  activateProfile,
  navigate,
  reveal,
  waitForDisplayed,
  waitForOverlaysClosed,
} from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const INTERRUPTED = "restoring it was interrupted";

const profilePageRequests = async (origin: string) =>
  z
    .object({ requests: z.array(z.object({ url: z.string() })) })
    .parse(await (await fetch(`${origin}/__control/requests`)).json())
    .requests.filter(({ url }) => url === PROFILE_PAGE).length;

const startAnalysis = async () => {
  await navigate("my-mods");
  await waitForOverlaysClosed();
  // An empty library shows Analyze as a button; otherwise it is in the menu.
  if (await $("button=Analyze").isExisting()) {
    await $("button=Analyze").click();
  } else {
    await $('button[aria-label="More actions"]').click();
    await browser.keys("ArrowDown");
    await $('[role="menuitem"]=Analyze Local Addons').click();
  }
};

describe("Analyze after an interrupted restore from DMM's records", () => {
  it("lists the unrestored mod as not in the library, then restores it on retry", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await step("reset mods state from settings", async () => {
      await openSettings("tools");
      const reset = await $("button=Clear Mods State");
      await reveal(reset);
      await reset.waitForClickable();
      await reset.click();
      const confirm = await $('[role="alertdialog"]').$(
        "button=Clear Mods State",
      );
      await confirm.waitForClickable();
      await confirm.click();
      await observeUntil(
        "library emptied by reset",
        () => readLibraryIds(world, ALPHA.id),
        ({ active, profile }) => active.length === 0 && profile.length === 0,
      );
      await waitForOverlaysClosed();
    });

    const { configuration } = await assertOwnedWorld(world);
    const origin = configuration.endpoints[0].origin;
    await step(
      "analyze, then switch profiles while restoring waits",
      async () => {
        await startAnalysis();
        try {
          await observeUntil(
            "restoring never asked for the mod page",
            () => profilePageRequests(origin),
            (count) => count === 1,
          );
          // Switching back to Alpha marks its library as changed, so the
          // restore Analyze started for Alpha is dropped when its page arrives.
          await activateProfile(BETA.name);
          await activateProfile(ALPHA.name);
        } finally {
          await fetch(`${origin}/__control/release/${RESTORE_METADATA_HOLD}`);
        }
      },
    );
    await step("analysis reports the interrupted restore", async () => {
      const error = `//div[@role="dialog"]//*[contains(normalize-space(), "${INTERRUPTED}")]`;
      await browser.waitUntil(async () => (await $(error)).isDisplayed(), {
        timeout: 30_000,
        timeoutMsg: "Analysis never reported the interrupted restore",
      });
      const ids = await readLibraryIds(world, ALPHA.id);
      if (ids.profile.includes(CATALOG_MOD_ID))
        throw new Error("The restore was not interrupted");
    });

    await step("the card doesn't claim the mod was added", async () => {
      const card = analysisCard("pak01_dir.vpk");
      await waitForDisplayed(card);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "interrupted-restore.png"),
      );
      await expect($(card)).toHaveText(
        expect.stringContaining("Not in Library"),
      );
      await expect($(card)).not.toHaveText(
        expect.stringContaining("Added to Library"),
      );
      await browser.keys("Escape");
      await waitForOverlaysClosed();
    });

    await step("analyzing again restores the mod", async () => {
      await startAnalysis();
      await observeUntil(
        "mod restored from DMM's records",
        () => readLibraryIds(world, ALPHA.id),
        ({ active, profile }) =>
          active.includes(CATALOG_MOD_ID) && profile.includes(CATALOG_MOD_ID),
        30_000,
      );
    });

    await closeApplication(world, runtime.processId);
  });
});
