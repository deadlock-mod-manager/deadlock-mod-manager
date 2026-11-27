import { platform } from "@tauri-apps/plugin-os";
import { useEffect, useMemo } from "react";
import {
  comboFromEvent,
  findActionForCombo,
  isTextEditingCombo,
  type KeybindAction,
  resolveKeybinds,
} from "@/lib/keybinds";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

const logger = createLogger("keybinds");

export type KeybindHandlers = Record<KeybindAction, () => void | Promise<void>>;

const REPEATABLE_ACTIONS = new Set<KeybindAction>(["zoomIn", "zoomOut"]);

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export const useResolvedKeybinds = () => {
  const overrides = usePersistedStore((s) => s.keybindOverrides);
  return useMemo(() => resolveKeybinds(overrides, platform()), [overrides]);
};

export const useKeybinds = (handlers: KeybindHandlers) => {
  const keybinds = useResolvedKeybinds();

  useEffect(() => {
    const currentPlatform = platform();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const combo = comboFromEvent(event, currentPlatform);
      if (!combo) return;
      const action = findActionForCombo(keybinds, combo);
      if (!action) return;
      if (isEditableTarget(event.target) && isTextEditingCombo(combo)) return;

      event.preventDefault();
      if (event.repeat && !REPEATABLE_ACTIONS.has(action)) return;

      logger.withMetadata({ action, combo }).debug("Keybind triggered");
      void handlers[action]();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [keybinds, handlers]);
};
