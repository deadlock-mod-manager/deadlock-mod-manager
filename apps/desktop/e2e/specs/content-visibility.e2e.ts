import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  openSettings,
  setSwitch,
  readSettings,
} from "../support/settings-actions";
import { observeUntil } from "../support/observations";
import { reveal } from "../support/ui";

const go = async (route: string) => {
  const link = await $(`a[href="${route}"]`);
  await reveal(link);
  await link.click();
  await expect(browser).toHaveUrl(expect.stringContaining(route));
};
const checkSurface = async (route: string, local: boolean, hidden: boolean) => {
  await go(route);
  const safe = `E2E ${local ? "Local " : ""}Safe Skin`;
  const adult = `E2E ${local ? "Local " : ""}Adult Skin`;
  await expect($("body")).toHaveText(expect.stringContaining(safe));
  if (hidden) {
    await expect($("body")).not.toHaveText(expect.stringContaining(adult));
    await expect($(`img[alt="${adult}"]`)).not.toExist();
  } else await expect($("body")).toHaveText(expect.stringContaining(adult));
};
const checkAllSurfaces = async (hidden: boolean) => {
  for (const route of ["/", "/mods", "/my-mods", "/skins"])
    await checkSurface(
      route,
      route === "/my-mods" || route === "/skins",
      hidden,
    );
};

describe("global content visibility", () => {
  it("applies global hiding across catalog, dashboard, library, skins and direct links", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const editing = process.env.DMM_E2E_PHASE === "content-preferences";
    const checkpoint = path.join(world, "artifacts", "content-process.json");
    if (editing) {
      await checkAllSurfaces(false);
      await openSettings("privacy");
      await setSwitch('[aria-label="Hide NSFW Content"]', true);
      await observeUntil(
        "Global NSFW hiding persisted",
        () => readSettings(world),
        (state) =>
          z.object({ hideNSFW: z.boolean() }).parse(state.nsfwSettings)
            .hideNSFW,
      );
      await checkAllSurfaces(true);
      // Direct navigation must not reveal a hidden mod's gallery or metadata.
      await browser.url(
        new URL("/mods/920002", await browser.getUrl()).toString(),
      );
      await expect($("body")).toHaveText(
        expect.stringContaining("Hide NSFW Content"),
      );
      await expect($("body")).not.toHaveText(
        expect.stringContaining("E2E Adult Skin"),
      );
      await expect($('img[alt="E2E Adult Skin"]')).not.toExist();
      await openSettings("privacy");
      await setSwitch('[aria-label="Hide NSFW Content"]', false);
      await checkAllSurfaces(false);
      await openSettings("privacy");
      await setSwitch('[aria-label="Hide NSFW Content"]', true);
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(previous.processId, runtime.processId);
      await checkAllSurfaces(true);
    }
    await browser.saveScreenshot(
      path.join(
        world,
        "artifacts",
        `content-${editing ? "hidden" : "restarted"}.png`,
      ),
    );
    await closeApplication(world, runtime.processId);
    const state = await readSettings(world);
    assert.equal(
      z.object({ hideNSFW: z.boolean() }).parse(state.nsfwSettings).hideNSFW,
      true,
    );
    assert.equal(
      z.array(z.json()).parse(state.localMods).length,
      2,
      "Hiding must not remove installed mods",
    );
  });
});
