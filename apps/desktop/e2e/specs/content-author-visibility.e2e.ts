import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { contentAuthor, contentAuthorId } from "../support/content-fixtures";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import {
  openSettings,
  readSettings,
  setSwitch,
} from "../support/settings-actions";
import { navigate, reveal } from "../support/ui";

const hideNSFW = (state: Record<string, unknown>) =>
  z.object({ hideNSFW: z.boolean() }).parse(state.nsfwSettings).hideNSFW;

const openAuthorPage = () =>
  step("open the author page from the catalog", async () => {
    await navigate("mods");
    await expect($("body")).toHaveText(
      expect.stringContaining("E2E Safe Skin"),
    );
    const link = await $(
      `button[aria-label="Show more mods by ${contentAuthor.name}"]`,
    );
    await reveal(link);
    await link.click();
    await expect(browser).toHaveUrl(
      expect.stringContaining(`/authors/${contentAuthorId}`),
    );
  });

const checkAuthorPage = (hidden: boolean) =>
  step(`author page ${hidden ? "hides" : "shows"} adult mods`, async () => {
    const grid = $('[data-testid="author-mods"]');
    await expect(grid).toHaveText(expect.stringContaining("E2E Safe Skin"));
    if (hidden) {
      await expect(grid).not.toHaveText(
        expect.stringContaining("E2E Adult Skin"),
      );
      await expect($('img[alt="E2E Adult Skin"]')).not.toExist();
    } else
      await expect(grid).toHaveText(expect.stringContaining("E2E Adult Skin"));
    await expect($$('[data-testid="author-mods"] > *')).toBeElementsArrayOfSize(
      hidden ? 1 : 2,
    );
    await expect($('[data-testid="author-result-count"]')).toHaveText(
      hidden ? "1 mod" : "2 mods",
    );
  });

describe("author page content visibility", () => {
  it("hides adult mods and their count on author pages", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const editing = process.env.DMM_E2E_PHASE === "author-preferences";
    const checkpoint = path.join(world, "artifacts", "author-process.json");
    if (editing) {
      await openAuthorPage();
      await checkAuthorPage(false);
      await openSettings("privacy");
      await setSwitch('[aria-label="Hide NSFW Content"]', true);
      await observeUntil(
        "Global NSFW hiding persisted",
        () => readSettings(world),
        hideNSFW,
      );
      await openAuthorPage();
      await checkAuthorPage(true);
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(previous.processId, runtime.processId);
      await openAuthorPage();
      await checkAuthorPage(true);
    }
    await browser.saveScreenshot(
      path.join(
        world,
        "artifacts",
        `author-${editing ? "hidden" : "restarted"}.png`,
      ),
    );
    await closeApplication(world, runtime.processId);
    assert.equal(hideNSFW(await readSettings(world)), true);
  });
});
