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
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target as HTMLElement)?.contentEditable === "true"
      ) {
        return;
      }

      const modifiers: string[] = [];
      if (event.ctrlKey) modifiers.push("Ctrl");
      if (event.altKey) modifiers.push("Alt");
      if (event.shiftKey) modifiers.push("Shift");
      if (event.metaKey) modifiers.push("Meta");

      const key = event.key.toUpperCase();

      const shortcutString = [...modifiers, key].join("+");

      const shortcut = shortcuts.find((s) => s.key === shortcutString);
      if (shortcut) {
        event.preventDefault();
        event.stopPropagation();

        logger
          .withMetadata({
            shortcut: shortcutString,
            description: shortcut.description,
          })
          .debug("Global shortcut triggered");

        shortcut.handler();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [shortcuts]);
};
