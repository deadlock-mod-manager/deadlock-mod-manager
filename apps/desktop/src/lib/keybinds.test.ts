import { describe, expect, it } from "bun:test";
import type { Platform } from "@tauri-apps/plugin-os";
import {
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
