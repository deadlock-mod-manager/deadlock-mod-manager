import { useEffect } from "react";
import { createLogger } from "@/lib/logger";

const logger = createLogger("global-shortcuts");

interface GlobalShortcut {
  key: string;
  handler: () => void | Promise<void>;
  description?: string;
}

export const useGlobalShortcuts = (shortcuts: GlobalShortcut[]) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when user is typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target as HTMLElement)?.contentEditable === "true"
      ) {
        return;
      }

      // Build the shortcut string
      const modifiers: string[] = [];
      if (event.ctrlKey) modifiers.push("Ctrl");
      if (event.altKey) modifiers.push("Alt");
      if (event.shiftKey) modifiers.push("Shift");
      if (event.metaKey) modifiers.push("Meta");

      // Normalize key to uppercase to match shortcut registration format
      let key = event.key.toUpperCase();

      // Handle special case for zoom in
      if (key === "ADD" || key === "+") {
        key = "=";
      }

      const shortcutString = [...modifiers, key].join("+");

      // Find matching shortcut
      const shortcut = shortcuts.find((s) => s.key === shortcutString);
      if (shortcut) {
        event.preventDefault();
        event.stopPropagation();

        logger.debug("Global shortcut triggered", {
          shortcut: shortcutString,
          description: shortcut.description,
        });

        shortcut.handler();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [shortcuts]);
};
