import assert from "node:assert/strict";
import { $, $$, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { selectSetting } from "../support/settings-actions";
import {
  chooseChart,
  chooseSourceMode,
  DEFAULT_OVERVIEW,
  editorDialog,
  expectTable,
  openStats,
  openWidgetEditor,
  readSavedLayout,
  saveLayout,
  setWidgetTitle,
  startEditing,
  submitEditor,
  typeOver,
  waitForWidgetState,
  widgetSources,
} from "../support/stats-dashboard-actions";
import { HERO_BAN_ROWS } from "../support/stats-dashboard-fixtures";

const BANS_PATH = "/v1/analytics/hero-ban-stats?min_unix_timestamp={since_30d}";

const toggleMetric = (label: string) =>
  step(`toggle the ${label} metric`, async () => {
    const chip = await editorDialog().$(
      `//button[@aria-pressed and normalize-space()="${label}"]`,
    );
    const before = await chip.getAttribute("aria-pressed");
    await chip.click();
    await expect(chip).toHaveAttribute(
      "aria-pressed",
      before === "true" ? "false" : "true",
    );
  });

const setApiPath = (value: string) =>
  step(`request ${value}`, async () => {
    await typeOver(
      () => editorDialog().$('input[aria-label="Request path"]'),
      value,
    );
    // Enter loads right away instead of after the typing pause, like a user
    // who wants to see the result.
    await browser.keys("Enter");
  });

const customWidgets = async () =>
  (await widgetSources()).slice(DEFAULT_OVERVIEW.length);

describe("stats dashboard custom queries", () => {
  it("builds stats from the match history and from any API path", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    assert.equal(process.env.DMM_E2E_PHASE, "queries");
    await openStats();
    await startEditing();

    await step(
      "an own query computes winrate, matches and KDA per hero",
      async () => {
        await openWidgetEditor();
        await chooseSourceMode("matches");
        await chooseChart("table");
        await toggleMetric("KDA");
        await setWidgetTitle("Per hero");
        await submitEditor();
        // Infernus 6 of 13 won, (84 + 104) / 52; Seven 4 of 7, (46 + 56) / 28.
        await expectTable(
          $('[data-widget-source="matches"]'),
          ["Hero", "Winrate", "Matches", "KDA"],
          [
            ["Infernus", "46%", "13", "3.62"],
            ["Seven", "57%", "7", "3.64"],
          ],
        );
      },
    );

    await step("regrouping the same query splits it by result", async () => {
      await openWidgetEditor();
      await chooseSourceMode("matches");
      await selectSetting('[aria-label="Group by"]', "Win or loss");
      await chooseChart("table");
      await submitEditor();
      const widgets = await $$('[data-widget-source="matches"]');
      await expectTable(
        widgets[1],
        ["Win or loss", "Winrate"],
        [
          ["Loss", "0.0%"],
          ["Win", "100%"],
        ],
      );
    });

    await step(
      "an API query fills its placeholder and charts the response",
      async () => {
        await openWidgetEditor();
        await chooseSourceMode("api");
        await setApiPath(BANS_PATH);
        // The preview titles itself after the endpoint it now reads.
        await expect(editorDialog().$("[data-widget-state] h3")).toHaveText(
          "/v1/analytics/hero-ban-stats",
        );
        await waitForWidgetState(editorDialog(), "ready");
        await chooseChart("table");
        await submitEditor();
        // Raw API fields keep their names; ids still resolve to heroes.
        await expectTable(
          $('[data-widget-source="api"]'),
          ["hero_id", "bans"],
          HERO_BAN_ROWS,
        );
      },
    );

    await step(
      "a path off deadlock-api is refused before anything is sent",
      async () => {
        await openWidgetEditor();
        await chooseSourceMode("api");
        await setApiPath("https://example.com/v1/players");
        const preview = await editorDialog().$('[data-widget-state="broken"]');
        await preview.waitForDisplayed();
        await expect(preview).toHaveText(
          expect.stringContaining("The request path is not valid"),
        );
        await expect(
          editorDialog().$('[data-testid="widget-editor-save"]'),
        ).toBeDisabled();
        await editorDialog().$("button=Cancel").click();
        await expect(editorDialog()).not.toBeDisplayed();
      },
    );

    expect(await customWidgets()).toEqual(["matches", "matches", "api"]);
    await saveLayout();
    await closeApplication(world, runtime.processId);

    const overview = (await readSavedLayout(world))?.tabs.find(
      (tab) => tab.id === "overview",
    );
    const saved = overview?.widgets.slice(DEFAULT_OVERVIEW.length) ?? [];
    assert.deepEqual(
      saved.map((widget) => [widget.source.kind, widget.view?.chart]),
      [
        ["matches", "table"],
        ["matches", "table"],
        ["api", "table"],
      ],
    );
    // The template is stored, not the resolved timestamp, so the window keeps
    // moving with every load.
    assert.equal(saved[2]?.source.path, BANS_PATH);
    assert.deepEqual(saved[0]?.view?.y, ["winrate", "matches", "kda"]);
  });
});
