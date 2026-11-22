import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { readSettings } from "../support/settings-actions";
import {
  openStats,
  readSavedLayout,
  selectTab,
  widget,
} from "../support/stats-dashboard-actions";
import { readStatsItemsCache } from "../support/stats-dashboard-fixtures";
import { assertOwnedWorld } from "../support/world";

describe("Items request errors", () => {
  it("distinguishes a failed cold request from a successful empty response", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    assert(
      phase === "player-error" ||
        phase === "baseline-error" ||
        phase === "catalog-error" ||
        phase === "empty-items",
    );
    const { configuration } = await assertOwnedWorld(world);
    const protectedFile = path.join(
      configuration.roots.game,
      "game",
      "citadel",
      "gameinfo.gi",
    );
    const gameinfo = await readFile(protectedFile);
    assert.deepEqual(
      Object.keys(await readStatsItemsCache(world)).filter((key) =>
        ["player:items:", "benchmark:items:", "assets:items"].some((prefix) =>
          key.startsWith(prefix),
        ),
      ),
      [],
      "Each phase must start without cached item stats or catalog",
    );
    await openStats();
    await selectTab("Items");
    const items = widget("items");

    if (phase === "empty-items") {
      await step(
        "a successful empty item response keeps the patron empty state",
        async () => {
          await expect(items.$("h3=No item stats yet")).toBeDisplayed();
          await expect(
            items.$("button=Get matches analysed first"),
          ).toBeDisplayed();
          await expect(items.$("button=Try again")).not.toBeExisting();
          await expect(items).not.toHaveText(
            expect.stringContaining("Couldn’t load item stats"),
          );
        },
      );
    } else {
      await step(
        `${phase} shows an error instead of the patron CTA`,
        async () => {
          await expect(items.$('[role="status"] h3')).toHaveText(
            "Couldn’t load item stats",
          );
          await expect(items.$("button=Try again")).toBeEnabled();
          await expect(
            items.$("button=Get matches analysed first"),
          ).not.toBeExisting();
          const cache = await readStatsItemsCache(world);
          const prefix =
            phase === "player-error"
              ? "player:items:"
              : phase === "baseline-error"
                ? "benchmark:items:"
                : "assets:items";
          assert.equal(
            Object.keys(cache).some((key) => key.startsWith(prefix)),
            false,
            "The failed request must have no cached fallback",
          );
        },
      );
      await step("Try again renders the recovered items", async () => {
        await items.$("button=Try again").click();
        await expect(items.$("h3=Your items against everyone")).toBeDisplayed();
        await expect(items).toHaveText(expect.stringContaining("Extra Charge"));
        await expect(items).toHaveText(expect.stringContaining("51%"));
        await expect(items).toHaveText(expect.stringContaining("10000"));
        await expect(items.$("button=Try again")).not.toBeExisting();
        await expect(
          items.$("button=Get matches analysed first"),
        ).not.toBeExisting();
      });
    }
    await browser.saveScreenshot(
      path.join(world, "artifacts", `stats-items-${phase}.png`),
    );
    await closeApplication(world, runtime.processId);
    await step(
      "normal close preserves the account, layout, item cache and game bytes",
      async () => {
        const cache = await readStatsItemsCache(world);
        const mine = Object.entries(cache).filter(([key]) =>
          key.startsWith("player:items:"),
        );
        assert.equal(mine.length, 1);
        assert.deepEqual(
          mine[0]?.[1].data,
          phase === "empty-items"
            ? []
            : [
                {
                  item_id: 7409189,
                  wins: 5100,
                  losses: 4900,
                  matches: 10000,
                  players: 9000,
                  avg_buy_time_s: 820,
                  avg_buy_time_relative: 36,
                },
              ],
        );
        assert.equal((await readSettings(world)).statsAccountId, 1001);
        assert.equal(await readSavedLayout(world), null);
        assert.deepEqual(await readFile(protectedFile), gameinfo);
        await writeFile(
          path.join(world, "artifacts", `stats-items-${phase}.json`),
          JSON.stringify(cache, null, 2),
        );
      },
    );
    if (phase !== "empty-items")
      await writeFile(
        path.join(configuration.roots.appData, "stats-cache.json"),
        "{}",
      );
  });
});
