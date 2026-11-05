import { expect, test } from "bun:test";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import type { DragDropEvent } from "@tauri-apps/api/webview";
import { getSourceFilePath } from "@/lib/file-utils";
import {
  handlesWorkspaceDrop,
  workspaceDropRoute,
} from "@/lib/modding-workspace-drop";
import {
  createNativeFileDropBridge,
  listenForNativeFileDrops,
} from "./use-native-file-drops";

test("native image drops hit the nested target in CSS pixels and preserve the source path", () => {
  const events: string[] = [];
  const bridge = createNativeFileDropBridge<string>({
    pixelRatio: () => 2,
    targetAt: (x, y) => {
      expect([x, y]).toEqual([50, 60]);
      return "nested-image-projector";
    },
    emit: (target, type, files) => {
      events.push(`${target}:${type}`);
      expect(getSourceFilePath(files[0])).toBe("/tmp/texture.png");
      if (type === "drop") {
        const route = workspaceDropRoute(
          { types: ["Files"], files, items: [], getData: () => "" },
          false,
          "current",
        );
        expect(handlesWorkspaceDrop(route, "capture", false)).toBe(false);
        // The projector consumes this drop before it bubbles to workspace fallback.
        expect(handlesWorkspaceDrop(route, "bubble", true)).toBe(false);
      }
    },
  });
  bridge.handle({
    type: "drop",
    paths: ["/tmp/texture.png"],
    position: new PhysicalPosition(100, 120),
  });
  expect(events).toEqual([
    "nested-image-projector:dragenter",
    "nested-image-projector:drop",
  ]);
});

test("native VPKs still receive workspace capture priority over a nested file tree", () => {
  const bridge = createNativeFileDropBridge<string>({
    pixelRatio: () => 1,
    targetAt: () => "nested-file-tree",
    emit: (target, type, files) => {
      if (type !== "drop") return;
      expect(target).toBe("nested-file-tree");
      const route = workspaceDropRoute(
        { types: ["Files"], files, items: [], getData: () => "" },
        false,
        "current",
      );
      expect(handlesWorkspaceDrop(route, "capture", false)).toBe(true);
    },
  });
  bridge.handle({
    type: "enter",
    paths: ["/tmp/skin.vpk"],
    position: new PhysicalPosition(0, 0),
  });
  bridge.handle({
    type: "drop",
    paths: ["/tmp/skin.vpk"],
    position: new PhysicalPosition(0, 0),
  });
});

test("moving between nested targets emits leave/enter and disposal clears active state", () => {
  const events: string[] = [];
  const bridge = createNativeFileDropBridge<string>({
    pixelRatio: () => 1,
    targetAt: (x) => (x ? "second" : "first"),
    emit: (target, type) => {
      events.push(`${target}:${type}`);
    },
  });
  bridge.handle({
    type: "enter",
    paths: ["/tmp/a.gif"],
    position: new PhysicalPosition(0, 0),
  });
  bridge.handle({ type: "over", position: new PhysicalPosition(10, 0) });
  bridge.dispose();
  const count = events.length;
  bridge.handle({
    type: "drop",
    paths: ["/tmp/a.gif"],
    position: new PhysicalPosition(10, 0),
  });
  expect(events).toEqual([
    "first:dragenter",
    "first:dragover",
    "first:dragleave",
    "second:dragenter",
    "second:dragover",
    "second:dragleave",
  ]);
  expect(events).toHaveLength(count);
});

test("unmount before native listener resolves unregisters once and suppresses late events", async () => {
  let resolveListener: ((cleanup: () => void) => void) | undefined;
  let listener: ((event: DragDropEvent) => void) | undefined;
  let handled = 0;
  let disposed = 0;
  let unlistened = 0;
  const stop = listenForNativeFileDrops(
    (handler) => {
      listener = handler;
      return new Promise((resolve) => {
        resolveListener = resolve;
      });
    },
    {
      handle: () => {
        handled++;
      },
      dispose: () => {
        disposed++;
      },
    },
  );
  stop();
  stop();
  listener?.({ type: "leave" });
  resolveListener?.(() => {
    unlistened++;
  });
  await Promise.resolve();
  expect(handled).toBe(0);
  expect(disposed).toBe(1);
  expect(unlistened).toBe(1);
});
