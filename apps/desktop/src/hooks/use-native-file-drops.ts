import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { useEffect } from "react";
import { createPathBackedFile } from "@/lib/file-utils";
import logger from "@/lib/logger";

type DropEventName = "dragenter" | "dragover" | "dragleave" | "drop";
interface Position {
  x: number;
  y: number;
}
interface NativeDropSurface<Target> {
  pixelRatio: () => number;
  targetAt: (x: number, y: number) => Target | null;
  emit: (
    target: Target,
    type: DropEventName,
    files: File[],
    position: Position,
    related: Target | null,
  ) => void;
}

export function createNativeFileDropBridge<Target>(
  surface: NativeDropSurface<Target>,
) {
  let target: Target | null = null;
  let files: File[] = [];
  let position: Position = { x: 0, y: 0 };
  let disposed = false;
  const leave = () => {
    if (target) surface.emit(target, "dragleave", files, position, null);
    target = null;
    files = [];
  };
  return {
    handle(event: DragDropEvent) {
      if (disposed) return;
      if (event.type === "leave") {
        leave();
        return;
      }
      if (event.type === "enter" || event.type === "drop")
        files = event.paths.map(createPathBackedFile);
      const ratio = surface.pixelRatio() || 1;
      position = { x: event.position.x / ratio, y: event.position.y / ratio };
      const next = surface.targetAt(position.x, position.y);
      if (next !== target) {
        if (target) surface.emit(target, "dragleave", files, position, next);
        const previous = target;
        target = next;
        if (target)
          surface.emit(target, "dragenter", files, position, previous);
      }
      if (target)
        surface.emit(
          target,
          event.type === "drop" ? "drop" : "dragover",
          files,
          position,
          null,
        );
      if (event.type === "drop") {
        target = null;
        files = [];
      }
    },
    dispose() {
      disposed = true;
      leave();
    },
  };
}

export function listenForNativeFileDrops(
  listen: (handler: (event: DragDropEvent) => void) => Promise<() => void>,
  bridge: { handle: (event: DragDropEvent) => void; dispose: () => void },
) {
  let stopped = false;
  let unlisten: (() => void) | undefined;
  void listen((event) => {
    if (!stopped) bridge.handle(event);
  })
    .then((cleanup) => {
      if (stopped) cleanup();
      else unlisten = cleanup;
    })
    .catch((error) =>
      logger.withError(error).error("Could not listen for native file drops"),
    );
  return () => {
    if (stopped) return;
    stopped = true;
    bridge.dispose();
    unlisten?.();
  };
}

// Linux Wry intercepts native drops to prevent WebKit from navigating to files.
// Dispatch at the actual child so existing React capture/bubble ownership applies.
export function useNativeFileDrops() {
  useEffect(() => {
    const bridge = createNativeFileDropBridge<Element>({
      pixelRatio: () => window.devicePixelRatio,
      targetAt: (x, y) => document.elementFromPoint(x, y),
      emit: (target, type, files, position, relatedTarget) => {
        const dataTransfer = new DataTransfer();
        for (const file of files) dataTransfer.items.add(file);
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            dataTransfer,
            clientX: position.x,
            clientY: position.y,
            relatedTarget,
          }),
        );
      },
    });
    return listenForNativeFileDrops(
      (handler) =>
        getCurrentWebview().onDragDropEvent((event) => handler(event.payload)),
      bridge,
    );
  }, []);
}
