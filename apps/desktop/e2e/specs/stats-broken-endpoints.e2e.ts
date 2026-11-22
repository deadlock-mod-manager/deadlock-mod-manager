import assert from "node:assert/strict";
import { expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  editorDialog,
  expectTable,
  openStats,
  readSavedLayout,
  saveLayout,
  selectTab,
  startEditing,
  submitEditor,
  tabTrigger,
  useWidgetMenu,
  waitForWidgetState,
  widgetById,
} from "../support/stats-dashboard-actions";

const HEALTH_TAB = "tab-health";

/** A broken widget names what failed and where, in its alert. */
const expectBroken = (id: string, reason: string, endpoint?: string) =>
  step(`${id} reports: ${reason}`, async () => {
    const container = widgetById(id);
    await waitForWidgetState(container, "broken");
    await expect(container.$('[role="alert"]')).toHaveText(
      expect.stringContaining(reason),
    );
    if (endpoint) await expect(container.$("code")).toHaveText(endpoint);
  });

describe("stats dashboard broken endpoints", () => {
  it("shows why each widget broke, recovers on retry and is repairable", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    assert.equal(process.env.DMM_E2E_PHASE, "broken");

    // The layout an earlier session saved, before deadlock-api changed.
    await openStats(["overview", "live", HEALTH_TAB]);
    await expect(tabTrigger("overview")).toHaveAttribute(
      "data-broken",
      "false",
    );
    await selectTab("Health");

    await expectBroken(
      "widget-recovering",
      "HTTP 404",
      "/v1/analytics/item-stats",
    );
    await expectBroken(
      "widget-renamed-field",
      "no longer has the shape this widget expects",
      "/v1/analytics/hero-ban-stats",
    );
    await expectBroken("widget-missing-field", "contestRate");
    await expectBroken(
      "widget-removed-preset",
      "not available in this version of the app",
    );

    await step("the healthy widget beside them is unaffected", async () => {
      await waitForWidgetState(widgetById("widget-healthy"), "ready");
      await expectTable(
        widgetById("widget-healthy"),
        ["Heroes", "Winrate"],
        [["Infernus + Seven", "64%"]],
      );
      await expect(tabTrigger(HEALTH_TAB)).toHaveAttribute(
        "data-broken",
        "true",
      );
      await expect(tabTrigger("overview")).toHaveAttribute(
        "data-broken",
        "false",
      );
    });

    await step("retry refetches once the endpoint is back", async () => {
      const recovering = widgetById("widget-recovering");
      await recovering.$("button=Try again").click();
      await waitForWidgetState(recovering, "ready");
      // 5,100 of 10,000 matches won with the item.
      await expectTable(
        recovering,
        ["Item", "Winrate"],
        [["Extra Charge", "51%"]],
      );
      // Three widgets are still broken, so the tab keeps its marker.
      await expect(tabTrigger(HEALTH_TAB)).toHaveAttribute(
        "data-broken",
        "true",
      );
    });

    await startEditing();

    await step(
      "editing a widget with a vanished field re-fits it",
      async () => {
        await widgetById("widget-missing-field")
          .$('button[aria-label="Edit"]')
          .click();
        await waitForWidgetState(editorDialog(), "ready");
        await submitEditor();
        await waitForWidgetState(widgetById("widget-missing-field"), "ready");
      },
    );

    await step("removing the rest clears the tab marker", async () => {
      await useWidgetMenu(widgetById("widget-renamed-field"), ["Remove"]);
      await useWidgetMenu(widgetById("widget-removed-preset"), ["Remove"]);
      await expect(tabTrigger(HEALTH_TAB)).toHaveAttribute(
        "data-broken",
        "false",
      );
    });

    await saveLayout();
    await closeApplication(world, runtime.processId);

    const health = (await readSavedLayout(world))?.tabs.find(
      (tab) => tab.id === HEALTH_TAB,
    );
    assert.deepEqual(
      health?.widgets.map((widget) => widget.id),
      ["widget-recovering", "widget-missing-field", "widget-healthy"],
    );
    assert.deepEqual(health?.widgets[1]?.view?.y, ["winrate"]);
  });
});
