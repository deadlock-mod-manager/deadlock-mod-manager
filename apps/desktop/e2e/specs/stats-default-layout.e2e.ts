import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  confirmAlert,
  DEFAULT_OVERVIEW,
  DEFAULT_TAB_IDS,
  DEFAULT_TAB_TITLES,
  openStats,
  readSavedLayout,
  selectTab,
  startEditing,
  tabIds,
  tabTitles,
  useWidgetMenu,
  widget,
  widgetSources,
} from "../support/stats-dashboard-actions";

describe("stats dashboard default layout", () => {
  it("keeps the built-in tabs and leaves no trace of abandoned edits", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    assert.equal(await readSavedLayout(world), null);

    await openStats();

    await step("the five built-in tabs open in their usual order", async () => {
      expect(await tabIds()).toEqual(DEFAULT_TAB_IDS);
      expect(await tabTitles()).toEqual(DEFAULT_TAB_TITLES);
      expect(await widgetSources()).toEqual(DEFAULT_OVERVIEW);
    });

    await step(
      "the key figures are computed from the match history",
      async () => {
        // 20 matches: (130 kills + 160 assists) / 80 deaths.
        await expect(widget("tiles")).toHaveText(
          expect.stringContaining("3.63"),
        );
        await expect(widget("tiles")).toHaveText(
          expect.stringContaining("50.0%"),
        );
      },
    );

    await step("every built-in tab shows its section", async () => {
      for (const [title, panel] of [
        ["Heroes", "heroes"],
        ["Items", "items"],
        ["Squad", "squad"],
        ["Live", "live"],
      ] as const) {
        await selectTab(title);
        expect(await widgetSources()).toEqual([panel]);
      }
      expect(await browser.getUrl()).toContain("tab=live");
      await selectTab("Overview");
    });

    await step("cancelling an untouched edit asks nothing", async () => {
      await startEditing();
      await $('[data-testid="stats-cancel"]').click();
      await expect($('[role="alertdialog"]')).not.toBeExisting();
      await expect($('[data-testid="stats-customize"]')).toBeDisplayed();
    });

    await step("cancelling a removal brings the widget back", async () => {
      await startEditing();
      await useWidgetMenu(widget("insights"), ["Remove"]);
      expect(await widgetSources()).toEqual(
        DEFAULT_OVERVIEW.filter((source) => source !== "insights"),
      );
      await $('[data-testid="stats-cancel"]').click();
      await confirmAlert("Discard");
      expect(await widgetSources()).toEqual(DEFAULT_OVERVIEW);
    });

    await closeApplication(world, runtime.processId);
    assert.equal(await readSavedLayout(world), null);
  });
});
