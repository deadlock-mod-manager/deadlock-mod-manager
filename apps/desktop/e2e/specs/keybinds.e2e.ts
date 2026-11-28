import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import { openSettings, readSettings } from "../support/settings-actions";
import { reveal, waitForOverlaysClosed } from "../support/ui";

const DIALOG = '[role="dialog"]';
const MENU_BAR = '[data-menubar="true"]';
const configuredOverrides = {
  openDownloads: "Mod+Shift+D",
  openMyMods: "Mod+1",
  openDashboard: null,
  openSettings: null,
};

const readOverrides = async (world: string) =>
  z
    .record(z.string(), z.string().nullable())
    .parse((await readSettings(world)).keybindOverrides ?? {});

const shortcutButton = (action: string) =>
  $(`${DIALOG} button[aria-label="Change shortcut for ${action}"]`);

type Shortcut = { label: string; press: () => Promise<void> };

const keys = (...pressed: string[]): Shortcut => ({
  label: pressed.join("+"),
  press: async () => {
    await browser.keys(pressed);
  },
});

// The embedded driver drops modifiers from special keys such as arrows and
// Enter, so Alt combos are dispatched the way it dispatches keys, with altKey.
const alt = (key: string): Shortcut => ({
  label: `Alt+${key}`,
  press: async () => {
    await browser.execute((pressed: string) => {
      const target = document.activeElement ?? document.body;
      const fire = (type: string, init: KeyboardEventInit) =>
        target.dispatchEvent(
          new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }),
        );
      fire("keydown", { key: "Alt", code: "AltLeft", altKey: true });
      fire("keydown", { key: pressed, code: pressed, altKey: true });
      fire("keyup", { key: pressed, code: pressed, altKey: true });
      fire("keyup", { key: "Alt", code: "AltLeft" });
    }, key);
  },
});

const press = (shortcut: Shortcut) =>
  step(`press ${shortcut.label}`, shortcut.press);

const pressAndExpectPath = (shortcut: Shortcut, pathname: string) =>
  step(`${shortcut.label} opens ${pathname}`, async () => {
    await shortcut.press();
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => window.location.pathname)) === pathname,
      { timeoutMsg: `${shortcut.label} did not open ${pathname}` },
    );
  });

// The world asks for English, but the webview reports the host language.
const useEnglish = () =>
  step("switch the interface to English", async () => {
    const settingsLink = $('a[href="/settings"]');
    await settingsLink.waitForClickable();
    if ((await settingsLink.getText()).includes("Settings")) return;
    await browser.execute(() => localStorage.setItem("i18nextLng", "en"));
    await browser.refresh();
    await expect($('a[href="/settings"]')).toHaveText(
      expect.stringContaining("Settings"),
    );
  });

const expectShortcut = async (action: string, labels: readonly string[]) => {
  const button = await shortcutButton(action);
  for (const label of labels)
    await expect(button).toHaveText(expect.stringContaining(label));
};

const record = (action: string, shortcut: Shortcut) =>
  step(`record ${shortcut.label} for ${action}`, async () => {
    const button = await shortcutButton(action);
    await reveal(button);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await shortcut.press();
  });

const openDialogFromSettings = () =>
  step("open the keyboard shortcuts dialog", async () => {
    await openSettings("application");
    const customize = await $("#settings-keybinds");
    await reveal(customize);
    await customize.click();
    await expect($(DIALOG)).toBeDisplayed();
  });

const closeDialog = () =>
  step("close the keyboard shortcuts dialog", async () => {
    await $(DIALOG).$("button=Done").click();
    await waitForOverlaysClosed();
  });

const windowState = () =>
  browser.execute(async () => ({
    maximized: await window.__TAURI_INTERNALS__.invoke<boolean>(
      "plugin:window|is_maximized",
      { label: "main" },
    ),
    fullscreen: await window.__TAURI_INTERNALS__.invoke<boolean>(
      "plugin:window|is_fullscreen",
      { label: "main" },
    ),
  }));

// Window keybinds must match the title bar: F11 maximizes and restores, and
// only leaves fullscreen when fullscreen is on. A window manager is required,
// which the Linux Xvfb runners do not have.
const verifyWindowShortcuts = () =>
  step("window shortcuts", async () => {
    assert.deepEqual(await windowState(), {
      maximized: false,
      fullscreen: false,
    });
    await pressWindow(keys("F11"), { maximized: true, fullscreen: false });
    await pressWindow(keys("F11"), { maximized: false, fullscreen: false });
    await pressWindow(keys("F11"), { maximized: true, fullscreen: false });
    await pressWindow(alt("Enter"), { maximized: true, fullscreen: true });
    await expect($(MENU_BAR)).not.toExist();
    await pressWindow(keys("F11"), { maximized: true, fullscreen: false });
    await pressWindow(keys("F11"), { maximized: false, fullscreen: false });
  });

const pressWindow = async (
  shortcut: Shortcut,
  expected: { maximized: boolean; fullscreen: boolean },
) => {
  await shortcut.press();
  await browser.waitUntil(
    async () => {
      const state = await windowState();
      return (
        state.maximized === expected.maximized &&
        state.fullscreen === expected.fullscreen
      );
    },
    {
      timeoutMsg: `${shortcut.label} did not leave the window ${JSON.stringify(expected)}`,
    },
  );
};

describe("keyboard shortcuts", () => {
  it("runs, records and persists keyboard shortcuts", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    const configuring = phase === "configure";
    assert(configuring || phase === "restart-keybinds");
    const checkpoint = path.join(world, "artifacts", "keybinds-process.json");
    await useEnglish();

    if (configuring) {
      assert.deepEqual(await readOverrides(world), {});
      await pressAndExpectPath(keys("Control", "2"), "/my-mods");
      await pressAndExpectPath(keys("Control", "4"), "/downloads");
      // Alt combos must not leave the Alt-tap menu bar open behind them.
      await pressAndExpectPath(alt("ArrowLeft"), "/my-mods");
      await expect($(MENU_BAR)).not.toExist();
      await pressAndExpectPath(alt("ArrowRight"), "/downloads");
      await expect($(MENU_BAR)).not.toExist();
      await pressAndExpectPath(keys("Control", ","), "/settings");
      await press(keys("Alt"));
      await expect($(MENU_BAR)).toBeDisplayed();
      await press(keys("Alt"));
      await expect($(MENU_BAR)).not.toExist();

      if (process.platform === "win32") await verifyWindowShortcuts();

      await openDialogFromSettings();
      // The shortcut for the editor must not stack a second editor on top.
      await press(keys("Control", "/"));
      await expect($$(DIALOG)).toBeElementsArrayOfSize(1);
      await record("Open downloads", keys("d"));
      await expect($(`${DIALOG} [role="alert"]`)).toHaveText(
        expect.stringContaining("function key"),
      );
      await press(keys("Control", "c"));
      await expect($(`${DIALOG} [role="alert"]`)).toHaveText(
        expect.stringContaining("reserved"),
      );
      // Esc ends the recording but keeps the dialog and the old shortcut.
      await press(keys("Escape"));
      await expect($(DIALOG)).toBeDisplayed();
      await expect(shortcutButton("Open downloads")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await expectShortcut("Open downloads", ["Ctrl", "4"]);

      await record("Open downloads", keys("Control", "Shift", "d"));
      await expectShortcut("Open downloads", ["Ctrl", "Shift", "D"]);
      await record("Open My Mods", keys("Control", "1"));
      await expectShortcut("Open My Mods", ["Ctrl", "1"]);
      await expect(
        $('//*[@data-sonner-toast and contains(., "Open dashboard")]'),
      ).toBeDisplayed();
      await expect(shortcutButton("Open dashboard")).toHaveText("Not set");
      const unbind = await $(
        `${DIALOG} button[aria-label="Remove shortcut for Open settings"]`,
      );
      await reveal(unbind);
      await unbind.click();
      await expect(shortcutButton("Open settings")).toHaveText("Not set");
      await expect(
        $(`${DIALOG} button[aria-label="Reset shortcut for Open settings"]`),
      ).toBeEnabled();
      await closeDialog();
      await expect($("#settings-keybinds")).toBeFocused();

      await observeUntil(
        "Keyboard shortcut overrides persisted",
        () => readOverrides(world),
        (overrides) =>
          JSON.stringify(Object.entries(overrides).sort()) ===
          JSON.stringify(Object.entries(configuredOverrides).sort()),
      );
    } else {
      const prior = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, prior.processId);
      assert.deepEqual(await readOverrides(world), configuredOverrides);
    }

    // Recorded shortcuts work and the shortcuts they replaced do not.
    await pressAndExpectPath(keys("Control", "1"), "/my-mods");
    await pressAndExpectPath(keys("Control", "Shift", "d"), "/downloads");
    await pressAndExpectPath(keys("Control", "1"), "/my-mods");
    await press(keys("Control", "4"));
    await press(keys("Control", ","));
    await pressAndExpectPath(keys("Control", "3"), "/mods");
    await pressAndExpectPath(alt("ArrowLeft"), "/my-mods");

    if (!configuring) {
      await press(keys("Control", "/"));
      await expect($(DIALOG)).toBeDisplayed();
      await expectShortcut("Open downloads", ["Ctrl", "Shift", "D"]);
      await expect(shortcutButton("Open dashboard")).toHaveText("Not set");
      await $(DIALOG).$("button=Reset all").click();
      await expectShortcut("Open dashboard", ["Ctrl", "1"]);
      await expectShortcut("Open My Mods", ["Ctrl", "2"]);
      await expectShortcut("Open downloads", ["Ctrl", "4"]);
      await expect($(DIALOG).$("button=Reset all")).toBeDisabled();
      await press(keys("Escape"));
      await waitForOverlaysClosed();
      await observeUntil(
        "Keyboard shortcut overrides reset",
        () => readOverrides(world),
        (overrides) => Object.keys(overrides).length === 0,
      );
      await pressAndExpectPath(keys("Control", "4"), "/downloads");
      await pressAndExpectPath(keys("Control", "1"), "/");
    }

    await browser.saveScreenshot(
      path.join(world, "artifacts", `keybinds-${phase}.png`),
    );
    if (configuring)
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    await closeApplication(world, runtime.processId);
  });
});
