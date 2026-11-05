import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import {
  CHANGED_KEY,
  FIRST_PRESET,
  PLAYER_VIDEO,
  SECOND_PRESET,
  changeInGame,
  presetVideo,
  readVideoRecord,
  readVideoSettings,
  videoPaths,
} from "../support/performance-fixtures";
import { navigate, reveal, waitForOverlaysClosed } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

const applyPreset = (presetId: string) =>
  step(`apply ${presetId}`, async () => {
    const card = $(`article[data-config-id="preset:${presetId}"]`);
    const apply = card.$("button*=Apply");
    await reveal(apply);
    await apply.click();
    await expect(card).toHaveText(expect.stringContaining("Applied"));
  });

const openTab = async (name: string) => {
  const tab = $(`//button[@role="tab"][normalize-space()="${name}"]`);
  await reveal(tab);
  await tab.click();
  await expect(tab).toHaveAttribute("data-state", "active");
};

const confirmDialog = async () => {
  const confirm = $('[role="alertdialog"] button[type="submit"]');
  await confirm.waitForClickable();
  await confirm.click();
  await waitForOverlaysClosed();
};

const turnOff = () =>
  step("turn the config off", async () => {
    const button = $("button=Turn off");
    await reveal(button);
    await button.click();
    await confirmDialog();
    await expect(button).not.toBeDisplayed();
  });

describe("performance configs and video.txt", () => {
  it("writes, settles and restores the player's video.txt", async () => {
    const runtime = await startApplication();
    const { world } = runtime.roots;
    const { configuration } = await assertOwnedWorld(world);
    const paths = videoPaths(configuration);
    const first = await presetVideo(FIRST_PRESET);
    const second = await presetVideo(SECOND_PRESET);
    const player = await readVideoSettings(paths.video);

    const holds = async (
      expected: Map<string, string>,
      label: string,
    ): Promise<void> => {
      await observeUntil(
        label,
        () => readVideoSettings(paths.video),
        (settings) =>
          [...expected].every(([key, value]) => settings.get(key) === value),
      );
    };
    // The header and settings no config writes stay as the player had them.
    const assertPlayerLinesKept = async () => {
      const text = await readFile(paths.video, "utf8");
      assert.match(text, /^"video\.cfg"\r\n\{\r\n\t"Version"\t\t"20"\r\n/);
      assert.match(text, /"setting\.defaultres"\t\t"2560"/);
    };

    await navigate("performance");
    await applyPreset(FIRST_PRESET);
    await holds(first, "First preset's video settings");
    await assertPlayerLinesKept();
    assert.equal(await readFile(paths.backup, "utf8"), PLAYER_VIDEO);

    let expectedAtClose = PLAYER_VIDEO;
    if (runtime.caseId === "perf-video-apply-restore") {
      await applyPreset(SECOND_PRESET);
      await step("the second preset replaces the first", async () => {
        await holds(second, "Second preset's video settings");
        const settings = await readVideoSettings(paths.video);
        for (const key of first.keys()) {
          if (second.has(key)) continue;
          assert.equal(settings.get(key), player.get(key), key);
        }
        assert.equal(
          await readFile(paths.backup, "utf8"),
          PLAYER_VIDEO,
          "the saved copy is still the file from before the first config",
        );
      });
      await step("restore the player's own file", async () => {
        await openTab("Video settings");
        const restore = $("button*=Restore it");
        await reveal(restore);
        await restore.click();
        await observeUntil(
          "Restored video.txt",
          () => readFile(paths.video, "utf8"),
          (text) => text === PLAYER_VIDEO,
        );
        await expect(restore).not.toBeDisplayed();
        assert.equal(await exists(paths.backup), false);
      });
    } else if (runtime.caseId === "perf-video-changed-in-game") {
      const configValue = first.get(CHANGED_KEY);
      assert(configValue && configValue !== "2");
      const row = $(`li[data-video-key="${CHANGED_KEY}"]`);
      await step("a value changed in game shows up", async () => {
        await openTab("Video settings");
        await changeInGame(paths.video, CHANGED_KEY, "2");
        // Coming back from the game is a window focus.
        await browser.execute(() => window.dispatchEvent(new Event("focus")));
        await row.waitForDisplayed();
      });
      await step("keep the player's value", async () => {
        await row.$("button=Keep yours").click();
        await observeUntil(
          "Kept in the record",
          () => readVideoRecord(paths.record),
          (record) => record.get(`setting.${CHANGED_KEY}`) === true,
        );
        await expect(row).toHaveText(expect.stringContaining("Keeping yours"));
        assert.equal(
          (await readVideoSettings(paths.video)).get(CHANGED_KEY),
          "2",
        );
      });
      await step("go back to the config's value", async () => {
        await row.$("button*=Use").click();
        await observeUntil(
          "Config value written back",
          () => readVideoSettings(paths.video),
          (settings) => settings.get(CHANGED_KEY) === configValue,
        );
        await expect(row).not.toBeDisplayed();
        await $(
          "p=Your video.txt matches the config again.",
        ).waitForDisplayed();
      });
      await step("History lists each step", async () => {
        await openTab("History");
        const history = $("main");
        for (const line of [
          "1 video setting changed in game",
          "Kept your video settings",
          "Went back to the config's video settings",
        ]) {
          await expect(history).toHaveText(expect.stringContaining(line));
        }
      });
      await turnOff();
      await observeUntil(
        "Turn off puts the player's file back",
        () => readFile(paths.video, "utf8"),
        (text) => text === PLAYER_VIDEO,
      );
    } else {
      assert.equal(runtime.caseId, "perf-video-adopt");
      await step("make the config's file the player's own", async () => {
        await openTab("Video settings");
        const adopt = $("button=Make this my video.txt");
        await reveal(adopt);
        await adopt.click();
        await confirmDialog();
        await expect(adopt).not.toBeDisplayed();
      });
      expectedAtClose = await readFile(paths.video, "utf8");
      assert.equal(await readFile(paths.backup, "utf8"), expectedAtClose);
      await turnOff();
      assert.equal(
        await readFile(paths.video, "utf8"),
        expectedAtClose,
        "Turn off leaves the adopted values",
      );
      await step("restore brings back the adopted file", async () => {
        await openTab("Video settings");
        const restore = $("button*=Restore it");
        await reveal(restore);
        await restore.click();
        await observeUntil(
          "No saved copy left",
          () => exists(paths.backup),
          (present) => !present,
        );
        assert.equal(await readFile(paths.video, "utf8"), expectedAtClose);
      });
    }

    await closeApplication(world, runtime.processId);
    assert.equal(await readFile(paths.video, "utf8"), expectedAtClose);
  });
});
