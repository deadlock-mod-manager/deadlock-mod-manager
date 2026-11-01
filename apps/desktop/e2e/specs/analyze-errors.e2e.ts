import { $, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  analyzeFileBytes,
  CORRUPT_FILE,
  LOOKUP_FILES,
} from "../support/analyze-errors-fixtures";
import { step } from "../support/evidence";
import { readPersistedDocument } from "../support/observations";
import { navigate, waitForDisplayed } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const DIALOG = '[role="dialog"]';

type TabView = {
  selected: boolean;
  label: string;
  text: string;
  rows: string[];
};

// My Mods can mount more than one copy of the results dialog, stacked on top
// of each other, so every query stays inside the first one. Inside it the
// WebKitGTK driver never reports the tab triggers as clickable, and neither
// its click nor focus selects them; Radix selects a tab on a primary-button
// mousedown, so the page sends exactly that.
const selectTab = (value: string) =>
  browser.execute((tabValue: string) => {
    document
      .querySelector('[role="dialog"]')
      ?.querySelector(`[role="tab"][id$="-trigger-${tabValue}"]`)
      ?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
  }, value);

const readTab = (value: string) =>
  browser.execute((tabValue: string): TabView => {
    const dialog = document.querySelector('[role="dialog"]');
    const trigger = dialog?.querySelector(
      `[role="tab"][id$="-trigger-${tabValue}"]`,
    );
    const panel = dialog?.querySelector(
      '[role="tabpanel"][data-state="active"]',
    );
    return {
      selected: trigger?.getAttribute("aria-selected") === "true",
      label: trigger?.textContent?.trim() ?? "",
      text: (panel?.textContent ?? "").replace(/\s+/g, " ").trim(),
      rows: Array.from(
        panel?.querySelectorAll("[data-analysis-error]") ?? [],
        (row) => (row.textContent ?? "").replace(/\s+/g, " ").trim(),
      ),
    };
  }, value);

const openTab = async (value: string) => {
  await selectTab(value);
  await browser.waitUntil(async () => (await readTab(value)).selected, {
    timeoutMsg: `The ${value} tab did not open`,
  });
  return readTab(value);
};

describe("analysis errors", () => {
  it("lists files it couldn't check as errors, not as unknown addons", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const artifacts = path.join(world, "artifacts");
    await navigate("my-mods");
    await waitForDisplayed("button=Analyze");
    await $("button=Analyze").click();
    await waitForDisplayed(`${DIALOG} [role="tab"]`);
    const summary = await $(`${DIALOG} p`).getText();
    const dialogs = await browser.execute(
      () => document.querySelectorAll('[role="dialog"]').length,
    );

    const unknown = await openTab("unknown");
    await browser.saveScreenshot(path.join(artifacts, "analysis-unknown.png"));
    const errors = await openTab("errors");
    await browser.saveScreenshot(path.join(artifacts, "analysis-errors.png"));
    await writeFile(
      path.join(artifacts, "analysis-observed.json"),
      JSON.stringify({ dialogs, summary, unknown, errors }, null, 2),
    );

    const unknownFiles = LOOKUP_FILES.filter((name) =>
      unknown.text.includes(name),
    );
    await step("only the file the service didn't match is unknown", () => {
      expect(unknown.label).toBe("Unknown (1)");
      expect(unknownFiles).toHaveLength(1);
      return Promise.resolve();
    });

    await step("both files that parsed are still counted as found", () => {
      expect(summary).toContain("Found 2 addon(s)");
      return Promise.resolve();
    });

    await step("the Errors tab names each failure and counts it", () => {
      const failed = LOOKUP_FILES.find((name) => name !== unknownFiles[0]);
      expect(errors.text).toContain(`${failed}`);
      expect(errors.text).toContain("503");
      // The corrupt file's own row gives the parser's reason after its name.
      const corruptRow = errors.rows.find((row) => row.includes(CORRUPT_FILE));
      expect(corruptRow).toMatch(
        new RegExp(`^Failed to parse ${CORRUPT_FILE.replace(".", "\\.")}: \\S`),
      );
      expect(errors.text).not.toContain(`${unknownFiles[0]}`);
      expect(errors.rows).toHaveLength(2);
      expect(errors.label).toBe("Errors (2)");
      return Promise.resolve();
    });

    await step("nothing was registered or changed", async () => {
      const { state } = z
        .object({
          state: z.object({
            localMods: z.array(z.object({ id: z.string() })).default([]),
          }),
        })
        .parse(await readPersistedDocument(world));
      expect(state.localMods).toEqual([]);
      const { configuration } = await assertOwnedWorld(world);
      const addons = path.join(
        configuration.roots.game,
        "game",
        "citadel",
        "addons",
      );
      for (const name of [...LOOKUP_FILES, CORRUPT_FILE])
        expect(
          (await readFile(path.join(addons, name))).equals(
            analyzeFileBytes(name),
          ),
        ).toBe(true);
    });

    await closeApplication(world, runtime.processId);
  });
});
