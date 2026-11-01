import { $, $$, browser, expect } from "@wdio/globals";
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
const ACTIVE_PANEL = `${DIALOG} [role="tabpanel"][data-state="active"]`;

// Radix gives each trigger an id ending in its tab value.
const tab = (name: string) =>
  $(`${DIALOG} [role="tab"][id$="-trigger-${name.toLowerCase()}"]`);

const openTab = async (name: string) => {
  const trigger = await tab(name);
  await trigger.waitForDisplayed();
  // Inside this dialog the WebKitGTK driver never reports the triggers as
  // clickable, and neither its click nor focus selects them. Radix selects a
  // tab on a primary-button mousedown, so send exactly that.
  await browser.execute(
    (element: HTMLElement) =>
      element.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      ),
    trigger,
  );
  await expect(trigger).toHaveAttribute("aria-selected", "true");
  await waitForDisplayed(ACTIVE_PANEL);
  return {
    label: await tab(name).getText(),
    text: (await $(ACTIVE_PANEL).getText()).replace(/\s+/g, " ").trim(),
    rows: (await $$(`${ACTIVE_PANEL} [data-analysis-error]`)).length,
  };
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

    const unknown = await openTab("Unknown");
    await browser.saveScreenshot(path.join(artifacts, "analysis-unknown.png"));
    const errors = await openTab("Errors");
    await browser.saveScreenshot(path.join(artifacts, "analysis-errors.png"));
    await writeFile(
      path.join(artifacts, "analysis-observed.json"),
      JSON.stringify({ unknown, errors }, null, 2),
    );

    const unknownFiles = LOOKUP_FILES.filter((name) =>
      unknown.text.includes(name),
    );
    await step("only the file the service didn't match is unknown", () => {
      expect(unknown.label).toBe("Unknown (1)");
      expect(unknownFiles).toHaveLength(1);
      return Promise.resolve();
    });

    await step("the Errors tab names each failure and counts it", () => {
      const failed = LOOKUP_FILES.find((name) => name !== unknownFiles[0]);
      expect(errors.text).toContain(`${failed}`);
      expect(errors.text).toContain("503");
      expect(errors.text).toContain(CORRUPT_FILE);
      expect(errors.text).not.toContain(`${unknownFiles[0]}`);
      expect(errors.rows).toBe(2);
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
