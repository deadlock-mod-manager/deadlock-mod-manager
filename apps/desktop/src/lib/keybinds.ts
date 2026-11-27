import type { Platform } from "@tauri-apps/plugin-os";

export const KEYBIND_CATEGORIES = [
  "navigation",
  "game",
  "folders",
  "window",
] as const;

type KeybindCategory = (typeof KEYBIND_CATEGORIES)[number];

/**
 * A key combination such as `Mod+Shift+G`. `Mod` is Cmd on macOS and Ctrl
 * everywhere else, so stored bindings carry over between platforms.
 */
export type KeyCombo = string;

type KeybindDefinition = {
  category: KeybindCategory;
  defaultCombo: KeyCombo | null;
  macosCombo?: KeyCombo;
};

export const KEYBIND_DEFINITIONS = {
  goBack: {
    category: "navigation",
    defaultCombo: "Alt+ArrowLeft",
    macosCombo: "Mod+[",
  },
  goForward: {
    category: "navigation",
    defaultCombo: "Alt+ArrowRight",
    macosCombo: "Mod+]",
  },
  openDashboard: { category: "navigation", defaultCombo: "Mod+1" },
  openMyMods: { category: "navigation", defaultCombo: "Mod+2" },
  openBrowseMods: { category: "navigation", defaultCombo: "Mod+3" },
  openDownloads: { category: "navigation", defaultCombo: "Mod+4" },
  openSettings: { category: "navigation", defaultCombo: "Mod+," },
  openKeybinds: { category: "navigation", defaultCombo: "Mod+/" },
  launchModded: { category: "game", defaultCombo: "Mod+Shift+L" },
  launchVanilla: { category: "game", defaultCombo: null },
  openModsFolder: { category: "folders", defaultCombo: "Mod+M" },
  openGameFolder: { category: "folders", defaultCombo: "Mod+Shift+G" },
  openModsDataFolder: { category: "folders", defaultCombo: "Mod+Shift+M" },
  toggleMaximize: { category: "window", defaultCombo: "F11" },
  toggleFullscreen: {
    category: "window",
    defaultCombo: "Alt+Enter",
    macosCombo: "Mod+Ctrl+F",
  },
  reload: { category: "window", defaultCombo: "Mod+R" },
  zoomIn: { category: "window", defaultCombo: "Mod+=" },
  zoomOut: { category: "window", defaultCombo: "Mod+-" },
  resetZoom: { category: "window", defaultCombo: "Mod+0" },
  closeWindow: {
    category: "window",
    defaultCombo: "Alt+F4",
    macosCombo: "Mod+W",
  },
  quit: { category: "window", defaultCombo: null, macosCombo: "Mod+Q" },
} as const satisfies Record<string, KeybindDefinition>;

export type KeybindAction = keyof typeof KEYBIND_DEFINITIONS;

export const KEYBIND_ACTIONS = Object.keys(KEYBIND_DEFINITIONS).filter(
  (key): key is KeybindAction => key in KEYBIND_DEFINITIONS,
);

/** User changes on top of the defaults; `null` unbinds an action. */
export type KeybindOverrides = Partial<Record<KeybindAction, KeyCombo | null>>;

export type ResolvedKeybinds = ReadonlyMap<KeybindAction, KeyCombo | null>;

const MODIFIER_ORDER = ["Mod", "Ctrl", "Alt", "Shift", "Meta"] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "CapsLock",
  "Dead",
  "Process",
  "Unidentified",
]);

const TEXT_EDITING_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Backspace",
  "Delete",
]);

// Clipboard, undo, select-all and the page-level search (Ctrl+F in settings
// and My Mods) stay with the webview and the pages that already handle them.
const RESERVED_COMBOS = new Set([
  "Mod+A",
  "Mod+C",
  "Mod+V",
  "Mod+X",
  "Mod+Z",
  "Mod+Y",
  "Mod+Shift+Z",
  "Mod+F",
]);

const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;

const isMacPlatform = (platform: Platform) => platform === "macos";

export const defaultComboFor = (
  action: KeybindAction,
  platform: Platform,
): KeyCombo | null => {
  const definition: KeybindDefinition = KEYBIND_DEFINITIONS[action];
  if (isMacPlatform(platform) && definition.macosCombo) {
    return definition.macosCombo;
  }
  return definition.defaultCombo;
};

export const resolveKeybinds = (
  overrides: KeybindOverrides,
  platform: Platform,
): ResolvedKeybinds => {
  const resolved = new Map<KeybindAction, KeyCombo | null>();
  for (const action of KEYBIND_ACTIONS) {
    const override = overrides[action];
    resolved.set(
      action,
      override === undefined ? defaultComboFor(action, platform) : override,
    );
  }
  return resolved;
};

export const findActionForCombo = (
  keybinds: ResolvedKeybinds,
  combo: KeyCombo,
): KeybindAction | undefined =>
  KEYBIND_ACTIONS.find((action) => keybinds.get(action) === combo);

type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>;

// Non-Latin layouts (Cyrillic, Greek) and macOS Option report a non-ASCII
// character in `key`; the physical letter keeps Ctrl+R working on those.
const baseKeyFromEvent = (event: KeyEventLike): string => {
  const physical = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(event.code);
  const isNonAsciiCharacter = /^[^\x20-\x7e]$/.test(event.key);
  if (physical && isNonAsciiCharacter) {
    return physical[1] ?? physical[2] ?? event.key;
  }
  if (event.key === " ") return "Space";
  // Ctrl+Plus zooms in on layouts where "+" has its own key, as in browsers.
  if (event.key === "+") return "=";
  return event.key.length === 1 ? event.key.toUpperCase() : event.key;
};

/** Returns the combo for a key press, or null while only modifiers are held. */
export const comboFromEvent = (
  event: KeyEventLike,
  platform: Platform,
): KeyCombo | null => {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const key = baseKeyFromEvent(event);
  const isMac = isMacPlatform(platform);
  // Shift is already part of a symbol such as "=" typed with Shift+0.
  const shiftIsPartOfKey = key.length === 1 && !/^[A-Z0-9]$/.test(key);

  const pressed = new Set<Modifier>();
  if (isMac ? event.metaKey : event.ctrlKey) pressed.add("Mod");
  if (isMac && event.ctrlKey) pressed.add("Ctrl");
  if (event.altKey) pressed.add("Alt");
  if (event.shiftKey && !shiftIsPartOfKey) pressed.add("Shift");
  if (!isMac && event.metaKey) pressed.add("Meta");

  return [...MODIFIER_ORDER.filter((m) => pressed.has(m)), key].join("+");
};

const splitCombo = (combo: KeyCombo) => {
  const parts = combo.split("+");
  return { modifiers: parts.slice(0, -1), key: parts.at(-1) ?? "" };
};

export type KeybindValidation = "ok" | "needsModifier" | "reserved";

export const validateCombo = (combo: KeyCombo): KeybindValidation => {
  if (RESERVED_COMBOS.has(combo)) return "reserved";
  const { modifiers, key } = splitCombo(combo);
  const hasModifier = modifiers.some((m) => m !== "Shift");
  if (!hasModifier && !FUNCTION_KEY.test(key)) return "needsModifier";
  return "ok";
};

/** Keys a text field needs for the caret, so focused inputs keep them. */
export const isTextEditingCombo = (combo: KeyCombo) =>
  TEXT_EDITING_KEYS.has(splitCombo(combo).key);

const MAC_LABELS = new Map([
  ["Mod", "⌘"],
  ["Ctrl", "⌃"],
  ["Alt", "⌥"],
  ["Shift", "⇧"],
]);

const WINDOWS_LABELS = new Map([
  ["Mod", "Ctrl"],
  ["Meta", "Win"],
]);

const LINUX_LABELS = new Map([
  ["Mod", "Ctrl"],
  ["Meta", "Super"],
]);

const modifierLabelsFor = (platform: Platform) => {
  if (isMacPlatform(platform)) return MAC_LABELS;
  return platform === "windows" ? WINDOWS_LABELS : LINUX_LABELS;
};

const KEY_LABELS = new Map([
  ["ArrowLeft", "←"],
  ["ArrowRight", "→"],
  ["ArrowUp", "↑"],
  ["ArrowDown", "↓"],
  ["Escape", "Esc"],
]);

/** Splits a combo into the key labels shown on screen for `platform`. */
export const formatCombo = (combo: KeyCombo, platform: Platform): string[] => {
  const { modifiers, key } = splitCombo(combo);
  const labels = modifierLabelsFor(platform);
  return [
    ...modifiers.map((m) => labels.get(m) ?? m),
    KEY_LABELS.get(key) ?? key,
  ];
};
