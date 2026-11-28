import { $, $$, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { selectSetting } from "../support/settings-actions";
import { openStats, widget } from "../support/stats-dashboard-actions";

const RANGE = '[data-testid="stats-range"]';
const SEASON = '[data-testid="stats-season"]';

// The WebView driver can't type into a date input reliably; set it the way a
// picked date arrives, through the input event React listens to.
const setDate = (selector: string, date: string) =>
  browser.execute(
    (target: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(target);
      if (!input) throw new Error(`no input ${target}`);
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    selector,
    date,
  );

const expectRecord = (record: string) =>
  expect(widget("trends")).toHaveText(expect.stringContaining(record));

describe("stats season and date range", () => {
  it("narrows the page to a ranked season or a date range", async () => {
    const runtime = await startApplication();
    await openStats();
    await expectRecord("3W 3L");

    await step(
      "the seasons are offered newest first with their dates",
      async () => {
        await $(RANGE).click();
        await $(SEASON).click();
        const options = await $$('[role="option"]').map((option) =>
          option.getText(),
        );
        expect(options).toHaveLength(2);
        expect(options[0]).toMatch(/^Beta Season 2[\s\S]*present$/);
        expect(options[1]).toMatch(/^Beta Season 1/);
        await browser.keys("Escape");
      },
    );

    await selectSetting(SEASON, "Beta Season 1");
    await step("a past season keeps only its own matches", async () => {
      await expect($(RANGE)).toHaveText("Beta Season 1");
      await expectRecord("1W 2L");
    });

    await step("a start date replaces the season", async () => {
      await setDate('[data-testid="stats-since"]', "2026-10-26");
      await expect($(RANGE)).toHaveText(expect.stringContaining("Since"));
      await expect($(SEASON)).toHaveText("Choose a season");
      await expectRecord("3W 2L");
    });

    await step("an end date drops the matches after it", async () => {
      await setDate('[data-testid="stats-until"]', "2026-10-29");
      await expect($(RANGE)).toHaveText(expect.stringContaining("–"));
      await expectRecord("2W 2L");
    });

    await step("reset brings back every match", async () => {
      await browser.keys("Escape");
      await $('[data-testid="stats-reset"]').click();
      await expect($(RANGE)).toHaveText("All time");
      await expectRecord("3W 3L");
    });

    await closeApplication(runtime.roots.world, runtime.processId);
  });
});
