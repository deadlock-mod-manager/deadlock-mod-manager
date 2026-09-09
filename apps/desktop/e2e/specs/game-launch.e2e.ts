import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  openSettings,
  readSettings,
  setSwitch,
} from "../support/settings-actions";
import { observeUntil } from "../support/observations";
import { assertOwnedWorld, collectFileInventory } from "../support/world";
import { ALPHA } from "../support/profile-fixtures";
import { reveal } from "../support/ui";

const customSettings = z.record(
  z.string(),
  z.object({
    id: z.string(),
    key: z.string(),
    value: z.string(),
    description: z.string(),
    enabled: z.boolean(),
  }),
);
const readLaunches = async (world: string) => {
  try {
    const text = await readFile(
      path.join(world, "artifacts", "game-launches.ndjson"),
      "utf8",
    );
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) =>
        z
          .object({ program: z.string(), uri: z.string() })
          .parse(JSON.parse(line)),
      );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
};

describe("modded and vanilla launch", () => {
  it("honors launch options and switches gameinfo without changing installed mods", async () => {
    const runtime = await startApplication();
    const { world } = runtime.roots;
    const {
      configuration: {
        roots: { game, steam },
      },
    } = await assertOwnedWorld(world);
    const editing = process.env.DMM_E2E_PHASE === "launch-modes";
    const checkpoint = path.join(world, "artifacts", "launch-state.json");
    if (editing) {
      await openSettings("discord");
      await setSwitch("#toggle-game-presence", false);
      await openSettings("launch-options");
      const add = await $("button=Create");
      await reveal(add);
      await add.click();
      let dialog = await $('[role="dialog"]');
      await dialog.$('input[name="key"]').setValue("+fps_max");
      await dialog.$('input[name="value"]').setValue("90");
      await dialog.$('input[name="description"]').setValue("E2E frame limit");
      await dialog.$('button[type="submit"]').click();
      await expect(dialog).not.toBeDisplayed();
      const state = await observeUntil(
        "Custom launch option persisted",
        () => readSettings(world),
        (state) =>
          Object.values(customSettings.parse(state.settings)).some(
            (setting) => setting.description === "E2E frame limit",
          ),
      );
      const custom = Object.values(customSettings.parse(state.settings)).find(
        (setting) => setting.description === "E2E frame limit",
      );
      assert(custom);
      await setSwitch(`#toggle-setting-${custom.id}`, true);
      const card = await $(`#toggle-setting-${custom.id}`).$("../..");
      await card.$('button[aria-label="Edit"]').click();
      dialog = await $('[role="dialog"]');
      await dialog.$(`[id="cmd-${custom.id}"]`).setValue("+fps_max 120");
      await dialog.$("button=Save").click();
      await expect(dialog).not.toBeDisplayed();
      const inventory = await collectFileInventory(
        path.join(game, "game", "citadel", "addons"),
      );
      await writeFile(
        checkpoint,
        JSON.stringify({
          processId: runtime.processId,
          inventory,
          customId: custom.id,
        }),
      );
    }
    const saved = z
      .object({
        processId: z.number(),
        inventory: z.record(z.string(), z.string()),
        customId: z.string(),
      })
      .parse(JSON.parse(await readFile(checkpoint, "utf8")));
    if (!editing) assert.notEqual(runtime.processId, saved.processId);
    const settings = customSettings.parse((await readSettings(world)).settings);
    assert.equal(settings[saved.customId].value, "120");
    assert.equal(settings[saved.customId].enabled, true);
    const launch = async (vanilla: boolean, args: string) => {
      const count = (await readLaunches(world)).length;
      const button = await $(
        vanilla ? "button=Launch without mods" : "button*=Launch modded",
      );
      await button.waitForClickable();
      await button.click();
      const launches = await observeUntil(
        "Recorded Steam launch",
        () => readLaunches(world),
        (rows) => rows.length === count + 1,
      );
      assert.deepEqual(launches.at(-1), {
        program: path.join(steam, "steam.exe"),
        uri: `steam://run/1422450//${args}`,
      });
      const gameinfo = await readFile(
        path.join(game, "game", "citadel", "gameinfo.gi"),
        "utf8",
      );
      if (vanilla) assert.doesNotMatch(gameinfo, /Game\s+citadel\/addons/);
      else
        assert.match(
          gameinfo,
          new RegExp(`Game\\s+citadel/addons/${ALPHA.folder}`),
        );
      assert.deepEqual(
        await collectFileInventory(
          path.join(game, "game", "citadel", "addons"),
        ),
        saved.inventory,
      );
    };
    if (editing) {
      await launch(false, "+fps_max 120");
      await launch(true, "+fps_max 120");
      await openSettings("application");
      await setSwitch("#toggle-setting-launch-vanilla-no-args", true);
    }
    await launch(true, "");
    await launch(false, "+fps_max 120");
    await browser.saveScreenshot(
      path.join(
        world,
        "artifacts",
        `launch-${editing ? "configured" : "restarted"}.png`,
      ),
    );
    await closeApplication(world, runtime.processId);
    assert.deepEqual(
      await collectFileInventory(path.join(game, "game", "citadel", "addons")),
      saved.inventory,
    );
    assert.equal((await readLaunches(world)).length, editing ? 4 : 6);
  });
});
