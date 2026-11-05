import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { readBrokenLaunches } from "../support/broken-state-oracle";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import {
  applyPreset,
  openTab,
  refocusWindow,
} from "../support/performance-actions";
import {
  CONFIG_CONVAR,
  FIRST_PRESET,
  STOCK_GAMEINFO,
  gameinfoPath,
  readConvar,
  stockWithHandEdit,
} from "../support/performance-fixtures";
import { navigate, reveal } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const PASTED_NAME = "E2E pasted config";
const PASTED_VALUE = "4321";
const EDITED_VALUE = "5000";

describe("performance configs and gameinfo.gi", () => {
  it("writes the chosen config and keeps it written", async () => {
    const runtime = await startApplication();
    const { world } = runtime.roots;
    const { configuration } = await assertOwnedWorld(world);
    const gameinfo = gameinfoPath(configuration);
    const convar = () => readConvar(gameinfo, CONFIG_CONVAR);
    const convarBecomes = (value: string | undefined, label: string) =>
      observeUntil(label, convar, (current) => current === value);

    assert.equal(await convar(), undefined, "Valve's file doesn't set it");
    await navigate("performance");

    let expected: string | undefined;
    if (runtime.caseId === "perf-import-paste") {
      await step("paste a config, review it and apply it", async () => {
        await $("button*=Import config").click();
        const text = await $('textarea[aria-label="Config text"]');
        await text.waitForDisplayed();
        await text.setValue(
          `ConVars\n{\n\t${CONFIG_CONVAR} "${PASTED_VALUE}"\n}\n`,
        );
        await $("button=Review").click();
        const name = await $("#perf-import-name");
        await expect(name).toBeEnabled();
        await name.setValue(PASTED_NAME);
        await $("button=Save and apply").click();
        await expect($('[role="dialog"]')).not.toBeDisplayed();
      });
      expected = PASTED_VALUE;
      await convarBecomes(expected, "The pasted value is written");
      await step("the config is saved under Yours", async () => {
        const yours = await $("button*=Yours");
        await reveal(yours);
        await yours.click();
        await expect($(`article*=${PASTED_NAME}`)).toHaveText(
          expect.stringContaining("Applied"),
        );
      });
    } else {
      const presetValue = "6000";
      await applyPreset(FIRST_PRESET);
      await convarBecomes(presetValue, "The preset's value is written");
      expected = presetValue;

      if (runtime.caseId === "perf-gameinfo-resync") {
        await step("a game update replaces gameinfo.gi", async () => {
          await writeFile(gameinfo, await stockWithHandEdit());
          // Window focus checks at most every 10 seconds, so keep coming back.
          await observeUntil(
            "The config is written back",
            async () => {
              await refocusWindow();
              return convar();
            },
            (value) => value === presetValue,
            30_000,
          );
          assert.match(
            await readFile(gameinfo, "utf8"),
            /"e2e_hand_edit"\t\t"1"/,
            "the line added by hand stays",
          );
        });
      } else if (runtime.caseId === "perf-gameinfo-launch") {
        await step("launching writes the config back first", async () => {
          await writeFile(gameinfo, await readFile(STOCK_GAMEINFO));
          assert.equal(await convar(), undefined);
          const launch = await $("button*=Launch without mods");
          await launch.click();
          await observeUntil(
            "One launch",
            () => readBrokenLaunches(world),
            (launches) => launches.length === 1,
          );
          assert.equal(await convar(), presetValue);
        });
      } else {
        assert.equal(runtime.caseId, "perf-editor-undo");
        await step("change a value in Config settings", async () => {
          await openTab("Config settings");
          const search = await $('input[placeholder^="Search "]');
          await search.setValue(CONFIG_CONVAR);
          const input = await $(
            `[id="perf-entry-convars/${CONFIG_CONVAR}"] input`,
          );
          await reveal(input);
          await input.setValue(EDITED_VALUE);
          await browser.keys("Enter");
          const apply = await $("button=Apply changes");
          await reveal(apply);
          await apply.click();
          await convarBecomes(EDITED_VALUE, "The edited value is written");
        });
        await step("Undo goes back to the preset's value", async () => {
          const undo = await $(
            '//main//button[starts-with(normalize-space(), "Undo")]',
          );
          await reveal(undo);
          await undo.click();
          await convarBecomes(presetValue, "The preset's value is back");
        });
      }
    }

    await closeApplication(world, runtime.processId);
    assert.equal(await convar(), expected);
  });
});
