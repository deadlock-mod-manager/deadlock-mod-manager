import assert from "node:assert/strict";
import { $$, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import {
  chooseChart,
  choosePreset,
  DEFAULT_OVERVIEW,
  describeWidgets,
  editorDialog,
  expectTable,
  expectWidgetSources,
  openStats,
  openWidgetEditor,
  readSavedLayout,
  resetToDefault,
  saveLayout,
  setWidgetTitle,
  setWidgetWidth,
  startEditing,
  submitEditor,
  useWidgetMenu,
  waitForWidgetState,
  widget,
} from "../support/stats-dashboard-actions";
import { HERO_BAN_ROWS } from "../support/stats-dashboard-fixtures";

const BANS = "global.bans";
const META = "global.heroes";
const ARRANGED = [...DEFAULT_OVERVIEW, META, BANS];

const expectArranged = (title: string) =>
  step("the arranged widgets show their data", async () => {
    await expectWidgetSources(ARRANGED);
    await expect(widget(META)).toHaveAttribute("data-widget-width", "12");
    await expect(widget(BANS)).toHaveAttribute("data-widget-width", "6");
    await expect(widget(BANS).$("h3")).toHaveText(title);
    await waitForWidgetState(widget(META), "ready");
    await expectTable(widget(BANS), ["Hero", "Bans"], HERO_BAN_ROWS);
  });

describe("stats dashboard widgets", () => {
  it("adds, configures and arranges widgets that survive a restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    assert(phase === "arrange" || phase === "restart-arrange");
    await openStats();

    if (phase === "arrange") {
      await startEditing();

      await step("add hero bans as a half-width table", async () => {
        await openWidgetEditor();
        await choosePreset(BANS, "Hero bans");
        await chooseChart("table");
        // The preview already draws the real data before anything is added.
        await expectTable(editorDialog(), ["Hero", "Bans"], HERO_BAN_ROWS);
        await setWidgetTitle("Most banned");
        await setWidgetWidth("Half");
        await submitEditor();
        await expect(widget(BANS)).toHaveAttribute("data-widget-width", "6");
        await expectTable(widget(BANS), ["Hero", "Bans"], HERO_BAN_ROWS);
      });

      await step("add the hero meta with its default chart", async () => {
        await openWidgetEditor();
        await choosePreset(META, "Hero meta");
        await submitEditor();
        await waitForWidgetState(widget(META), "ready");
        await expectWidgetSources([...DEFAULT_OVERVIEW, BANS, META]);
      });

      await step("move the meta in front and widen it", async () => {
        await useWidgetMenu(widget(META), ["Move earlier"]);
        await expectWidgetSources(ARRANGED);
        await useWidgetMenu(widget(META), ["Width", "Full width"]);
        await expect(widget(META)).toHaveAttribute("data-widget-width", "12");
      });

      await step("a duplicate can be added and removed again", async () => {
        await useWidgetMenu(widget(BANS), ["Duplicate"]);
        expect(await $$(`[data-widget-source="${BANS}"]`).length).toBe(2);
        const copies = await $$(`[data-widget-source="${BANS}"]`);
        await useWidgetMenu(copies[1], ["Remove"]);
        await expectWidgetSources(ARRANGED);
      });

      await step("editing keeps the configuration and renames it", async () => {
        await widget(BANS).$('button[aria-label="Edit"]').click();
        await expect(editorDialog().$('input[aria-label="Title"]')).toHaveValue(
          "Most banned",
        );
        await expect(
          editorDialog().$('[data-chart-type="table"]'),
        ).toHaveAttribute("aria-pressed", "true");
        await setWidgetTitle("Bans by hero");
        await submitEditor();
        await expect(widget(BANS).$("h3")).toHaveText("Bans by hero");
      });

      await saveLayout();
      await expectArranged("Bans by hero");
      await observeUntil(
        "Arranged layout persisted",
        () => readSavedLayout(world),
        (layout) =>
          describeWidgets(layout, "overview").join() === ARRANGED.join(),
      );
    } else {
      await expectArranged("Bans by hero");
      await resetToDefault();
      await expectWidgetSources(DEFAULT_OVERVIEW);
    }

    await closeApplication(world, runtime.processId);
    const saved = await readSavedLayout(world);
    if (phase === "arrange") {
      const overview = saved?.tabs.find((tab) => tab.id === "overview");
      const [meta, bans] = overview?.widgets.slice(-2) ?? [];
      assert.equal(meta?.w, 12);
      assert.deepEqual(
        { title: bans?.title, w: bans?.w, chart: bans?.view?.chart },
        { title: "Bans by hero", w: 6, chart: "table" },
      );
    } else {
      // Saving the untouched default stores nothing at all.
      assert.equal(saved, null);
    }
  });
});
