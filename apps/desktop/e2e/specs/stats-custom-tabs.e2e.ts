import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import {
  choosePreset,
  confirmAlert,
  DEFAULT_OVERVIEW,
  DEFAULT_TAB_TITLES,
  expectActiveTab,
  expectWidgetSources,
  describeWidgets,
  openMenu,
  typeOver,
  openStats,
  openWidgetEditor,
  readSavedLayout,
  resetToDefault,
  saveLayout,
  selectTab,
  startEditing,
  submitEditor,
  tabTitles,
  useWidgetMenu,
  waitForWidgetState,
  widget,
} from "../support/stats-dashboard-actions";

const META_TEMPLATE = [
  "global.heroes",
  "global.bans",
  "global.duos",
  "global.daily",
  "global.items",
];
const WITHOUT_INSIGHTS = DEFAULT_OVERVIEW.filter(
  (source) => source !== "insights",
);
const MY_STATS = ["global.bans", "insights"];

const addTab = (entry: string) =>
  step(`add a tab: ${entry}`, async () => {
    await openMenu($('[data-testid="stats-add-tab"]'));
    const item = await $(
      `//*[@role="menuitem" and normalize-space()="${entry}"]`,
    );
    await item.waitForDisplayed();
    await item.click();
  });

const nameField = () => $('input[aria-label="Tab name"]');

const openTabSettings = () =>
  step("open the active tab's settings", async () => {
    await $('button[aria-label="Tab settings"]').click();
    await nameField().waitForDisplayed();
  });

const closeTabSettings = () =>
  step("close the tab settings", async () => {
    await $('[role="dialog"]').$("button=Done").click();
    await nameField().waitForExist({ reverse: true });
  });

describe("stats dashboard tabs", () => {
  it("builds tabs from templates and by hand, and keeps them after a restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    assert(phase === "tabs" || phase === "restart-tabs");
    await openStats();

    if (phase === "tabs") {
      await startEditing();

      await step(
        "the Meta template brings its widgets, all loaded",
        async () => {
          await addTab("Meta");
          await expectActiveTab("Meta");
          await expectWidgetSources(META_TEMPLATE);
          for (const source of META_TEMPLATE)
            await waitForWidgetState(widget(source), "ready");
        },
      );

      await step("an empty tab is renamed and gets an icon", async () => {
        await addTab("Empty tab");
        await expectWidgetSources([]);
        await openTabSettings();
        await typeOver(nameField, "My stats");
        // Closing the settings keeps the typed name.
        await closeTabSettings();
        await expectActiveTab("My stats");
        await openTabSettings();
        const trophy = await $('button[aria-label="trophy"]');
        await trophy.click();
        await expect(trophy).toHaveAttribute("aria-pressed", "true");
        await closeTabSettings();
        await expectActiveTab("My stats");
      });

      await step("a widget is added to the new tab", async () => {
        await openWidgetEditor();
        await choosePreset("global.bans", "Hero bans");
        await submitEditor();
        await waitForWidgetState(widget("global.bans"), "ready");
      });

      await step(
        "a section moves from the overview into the new tab",
        async () => {
          await selectTab("Overview");
          await useWidgetMenu(widget("insights"), ["Move to tab", "My stats"]);
          await expectWidgetSources(WITHOUT_INSIGHTS);
          await selectTab("My stats");
          await expectWidgetSources(MY_STATS);
        },
      );

      await step("deleting a tab asks first, then removes it", async () => {
        await selectTab("Meta");
        await openTabSettings();
        await $("button=Delete tab").click();
        await confirmAlert("Delete");
        expect(await tabTitles()).toEqual([...DEFAULT_TAB_TITLES, "My stats"]);
      });

      await saveLayout();
      await observeUntil(
        "Custom tab persisted",
        () => readSavedLayout(world),
        (layout) => describeWidgets(layout, "overview").length > 0,
      );
    } else {
      await step("the custom tab and the moved section are back", async () => {
        expect(await tabTitles()).toEqual([...DEFAULT_TAB_TITLES, "My stats"]);
        await expectWidgetSources(WITHOUT_INSIGHTS);
        await selectTab("My stats");
        await expectWidgetSources(MY_STATS);
        await waitForWidgetState(widget("global.bans"), "ready");
      });
      await resetToDefault();
      expect(await tabTitles()).toEqual(DEFAULT_TAB_TITLES);
    }

    await closeApplication(world, runtime.processId);
    const saved = await readSavedLayout(world);
    if (phase === "tabs") {
      const custom = saved?.tabs.at(-1);
      assert.equal(saved?.tabs.length, 6);
      assert.deepEqual(
        { title: custom?.title, icon: custom?.icon },
        { title: "My stats", icon: "trophy" },
      );
      assert.deepEqual(describeWidgets(saved, custom?.id ?? ""), MY_STATS);
      assert.deepEqual(describeWidgets(saved, "overview"), WITHOUT_INSIGHTS);
    } else {
      assert.equal(saved, null);
    }
  });
});
