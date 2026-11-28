import { describe, expect, it } from "bun:test";
import type { Platform } from "@tauri-apps/plugin-os";
import {
  assignKeybind,
  comboFromEvent,
  type KeybindValidation,
  resolveKeybinds,
  validateCombo,
} from "./keybinds";

type Press = {
  key: string;
  code: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  altGraph?: boolean;
};

const combo = (press: Press, platform: Platform = "windows") =>
  comboFromEvent(
    {
      key: press.key,
      code: press.code,
      ctrlKey: press.ctrl ?? false,
      altKey: press.alt ?? false,
      shiftKey: press.shift ?? false,
      metaKey: press.meta ?? false,
      getModifierState: (modifier) =>
        modifier === "AltGraph" && press.altGraph === true,
    },
    platform,
  );

describe("comboFromEvent", () => {
  it.each<[string, Press, Platform, string | null]>([
    [
      "ignores a lone modifier",
      { key: "Control", code: "ControlLeft", ctrl: true },
      "windows",
      null,
    ],
    [
      "uses the physical letter on Cyrillic layouts",
      { key: "к", code: "KeyR", ctrl: true },
      "windows",
      "Mod+R",
    ],
    [
      "uses the physical letter for macOS Option glyphs",
      { key: "©", code: "KeyG", alt: true },
      "macos",
      "Alt+G",
    ],
    [
      "keeps a shifted symbol on its digit key (QWERTZ /)",
      { key: "/", code: "Digit7", ctrl: true, shift: true },
      "windows",
      "Mod+/",
    ],
    [
      "uses the digit for AZERTY number-row symbols",
      { key: "&", code: "Digit1", ctrl: true },
      "windows",
      "Mod+1",
    ],
    [
      "keeps the AZERTY minus on its digit key",
      { key: "-", code: "Digit6", ctrl: true },
      "windows",
      "Mod+-",
    ],
    [
      "treats Ctrl+Plus as zoom in",
      { key: "+", code: "BracketRight", ctrl: true },
      "linux",
      "Mod+=",
    ],
    [
      "keeps Shift on letters",
      { key: "G", code: "KeyG", ctrl: true, shift: true },
      "windows",
      "Mod+Shift+G",
    ],
    [
      "maps Cmd to Mod on macOS",
      { key: "q", code: "KeyQ", meta: true },
      "macos",
      "Mod+Q",
    ],
    [
      "keeps Ctrl distinct from Cmd on macOS",
      { key: "f", code: "KeyF", meta: true, ctrl: true },
      "macos",
      "Mod+Ctrl+F",
    ],
    [
      "ignores characters typed with AltGr",
      { key: "€", code: "KeyE", ctrl: true, alt: true, altGraph: true },
      "windows",
      null,
    ],
    [
      "maps the Windows key to Meta",
      { key: "e", code: "KeyE", meta: true },
      "windows",
      "Meta+E",
    ],
  ])("%s", (_, press, platform, expected) => {
    expect(combo(press, platform)).toBe(expected);
  });
});

describe("resolveKeybinds", () => {
  it("applies platform defaults and lets null unbind", () => {
    const mac = resolveKeybinds({ reload: null }, "macos");

    expect(mac.get("quit")).toBe("Mod+Q");
    expect(mac.get("reload")).toBeNull();
    expect(resolveKeybinds({}, "windows").get("quit")).toBeNull();
  });

  it("gives a picked combo priority over a default that claims it", () => {
    const mac = resolveKeybinds({ openMyMods: "Mod+Q" }, "macos");

    expect(mac.get("openMyMods")).toBe("Mod+Q");
    expect(mac.get("quit")).toBeNull();
  });
});

describe("assignKeybind", () => {
  it("unbinds the action that held the combo", () => {
    expect(assignKeybind({}, "openMyMods", "Mod+1", "windows")).toEqual({
      overrides: { openMyMods: "Mod+1", openDashboard: null },
      displaced: "openDashboard",
    });
  });

  it("drops the override when the combo is the default again", () => {
    expect(
      assignKeybind({ reload: "Mod+Shift+R" }, "reload", "Mod+R", "windows"),
    ).toEqual({ overrides: {}, displaced: null });
  });

  it("keeps an unbind of an action without a default as no override", () => {
    expect(assignKeybind({}, "quit", null, "windows")).toEqual({
      overrides: {},
      displaced: null,
    });
  });
});

describe("validateCombo", () => {
  it.each<[string, KeybindValidation]>([
    ["Mod+C", "reserved"],
    ["Mod+F", "reserved"],
    ["Shift+A", "needsModifier"],
    ["Enter", "needsModifier"],
    ["F11", "ok"],
    ["Alt+Enter", "ok"],
  ])("%s is %s", (input, expected) => {
    expect(validateCombo(input)).toBe(expected);
  });
});
