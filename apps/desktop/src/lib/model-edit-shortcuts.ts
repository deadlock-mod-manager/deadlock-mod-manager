export interface ModelEditKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export function modelEditShortcut(
  event: ModelEditKey,
  editingText: boolean,
): "undo" | "redo" | null {
  if (
    editingText ||
    event.defaultPrevented ||
    event.altKey ||
    !(event.ctrlKey || event.metaKey)
  )
    return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  return key === "y" && !event.shiftKey ? "redo" : null;
}
