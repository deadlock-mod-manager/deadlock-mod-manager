import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { navigate, reveal } from "../support/ui";
import {
  openSettings,
  readSettings,
  setSwitch,
} from "../support/settings-actions";
import { observeUntil } from "../support/observations";

const image = () => $('img[alt="E2E Local Adult Skin"]');
const assertBlur = async (blurred: boolean) => {
  const target = await image();
  await reveal(target);
  await browser.waitUntil(
    async () => {
      const filters = await browser.execute((element: HTMLElement) => {
        const filters: string[] = [];
        for (
          let node: HTMLElement | null = element;
          node;
          node = node.parentElement
        )
          filters.push(getComputedStyle(node).filter);
        return filters;
      }, target);
      return filters.includes("blur(16px)") === blurred;
    },
    { timeoutMsg: `Expected adult preview blur to be ${blurred}` },
  );
};

describe("NSFW preview preferences", () => {
  it("remembers per-item reveals and honors the remember and disable-blur settings", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const editing = process.env.DMM_E2E_PHASE === "reveal-content";
    const checkpoint = path.join(world, "artifacts", "blur-process.json");
    await navigate("skins");
    if (editing) {
      await assertBlur(true);
      const card = await image().$('./ancestor::*[@role="button"][1]');
      await card.$("button=Show").click();
      await assertBlur(false);
      await observeUntil(
        "Remembered reveal persisted",
        () => readSettings(world),
        (state) =>
          z.record(z.string(), z.boolean()).parse(state.perItemNSFWOverrides)[
            "local-adult-skin"
          ] === true,
      );
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(previous.processId, runtime.processId);
      await assertBlur(false);
      await openSettings("privacy");
      await setSwitch('[aria-label="Remember Per-Item Choices"]', false);
      await navigate("skins");
      await assertBlur(true);
      await openSettings("privacy");
      await setSwitch('[aria-label="Disable NSFW Blur"]', true);
      await navigate("skins");
      await assertBlur(false);
      await expect(image()).toBeDisplayed();
      await openSettings("privacy");
      await setSwitch('[aria-label="Disable NSFW Blur"]', false);
      await navigate("skins");
      await assertBlur(true);
    }
    await browser.saveScreenshot(
      path.join(
        world,
        "artifacts",
        `blur-${editing ? "revealed" : "restarted"}.png`,
      ),
    );
    await closeApplication(world, runtime.processId);
  });
});
