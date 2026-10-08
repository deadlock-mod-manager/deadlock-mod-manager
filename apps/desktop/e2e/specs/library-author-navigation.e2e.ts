import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  contentAuthor,
  contentAuthorId,
  contentMods,
} from "../support/content-fixtures";
import { step } from "../support/evidence";
import { navigate, reveal, waitForDisplayed } from "../support/ui";

const authorLink = () =>
  $(`button[aria-label="Show more mods by ${contentAuthor.name}"]`);

const expectAuthor = async () => {
  await expect(browser).toHaveUrl(
    expect.stringContaining(`/authors/${contentAuthorId}`),
  );
  await expect($('[data-testid="author-mods"]')).toBeDisplayed();
};

const returnToLibrary = async () => {
  await $("button=Back to Mods Library").click();
  await expect(browser).toHaveUrl(expect.stringContaining("/my-mods"));
  await expect(authorLink()).toBeDisplayed();
};

describe("library author navigation", () => {
  it("returns to the library after viewing an author from either library layout", async () => {
    const runtime = await startApplication();
    const mod = contentMods[0];
    const legacy = process.env.DMM_E2E_PHASE === "legacy-author-navigation";
    if (!legacy) {
      await navigate("mods");
      await waitForDisplayed(`[title="${mod.name}"]`);
      await $(`[title="${mod.name}"]`).click();
      await waitForDisplayed('button[aria-label="Download Mod"]');
      await $('button[aria-label="Download Mod"]').click();
      await waitForDisplayed('[role="switch"]');
    }

    await navigate("my-mods");
    await waitForDisplayed("h1=Mods Library");
    if (legacy) {
      await expect($("body")).toHaveText(
        expect.stringContaining("E2E Local Mod"),
      );
      await expect(
        $('button[aria-label="Show more mods by Unknown"]'),
      ).not.toExist();
    }
    await step(
      "library grid opens the author and preserves nested navigation",
      async () => {
        await expect(authorLink()).toBeDisplayed();
        await authorLink().click();
        await expectAuthor();
        const card = await $('[data-testid="author-mods"]').$(
          `[title="${mod.name}"]`,
        );
        await reveal(card);
        await card.click();
        await expect(browser).toHaveUrl(
          expect.stringContaining(`/mods/${mod.id}`),
        );
        await $(`button=Back to ${contentAuthor.name}'s mods`).click();
        await expectAuthor();
        await returnToLibrary();
      },
    );

    await step(
      "library list opens the author and returns to the library",
      async () => {
        await $('button[aria-label="List view"]').click();
        await expect(authorLink()).toBeDisplayed();
        await authorLink().click();
        await expectAuthor();
        await returnToLibrary();
      },
    );

    await step(
      "library mod details preserve the library as the author origin",
      async () => {
        await $(`[title="${mod.name}"]`).click();
        const profile = await $(
          `button[aria-label="View profile: ${contentAuthor.name}"]`,
        );
        await reveal(profile);
        await profile.click();
        await expectAuthor();
        await returnToLibrary();
      },
    );

    if (!legacy) {
      await step(
        "store author navigation still returns to the store",
        async () => {
          await navigate("mods");
          await waitForDisplayed("h1=Mods Store");
          const link = await authorLink();
          await reveal(link);
          await link.click();
          await expectAuthor();
          await $("button=Back to Mods").click();
          await expect(browser).toHaveUrl(expect.stringMatching(/\/mods$/));
        },
      );
    }
    await closeApplication(runtime.roots.world, runtime.processId);
  });
});
