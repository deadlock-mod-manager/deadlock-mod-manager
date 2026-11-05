import { ADDON_FILE_DRAG } from "./modding-file-drag";
import { expect, test } from "bun:test";
import {
  acceptsWorkspaceDrop,
  captureWorkspaceDrop,
  workspaceDropRoute,
  handlesWorkspaceDrop,
} from "./modding-workspace-drop";

test("WebKit VPKs with empty File.name use their absolute webkitRelativePath", async () => {
  const file = new File(["vpk"], "");
  Object.defineProperty(file, "webkitRelativePath", {
    value: "/home/test/Downloads/skin_dir.vpk",
  });
  const drop = await captureWorkspaceDrop({
    files: [file],
    items: [],
    getData: () => "",
  });
  expect(drop.paths).toEqual(["/home/test/Downloads/skin_dir.vpk"]);
});

test("captures asynchronous URI items while the drop event still owns them", async () => {
  let inDropEvent = true;
  const item: DataTransferItem = {
    kind: "string",
    type: "text/uri-list",
    getAsFile: () => null,
    webkitGetAsEntry: () => null,
    getAsString: (callback) => {
      if (!inDropEvent) throw new Error("Drag data expired");
      queueMicrotask(() => callback?.("file:///home/test/Downloads/skin.zip"));
    },
  };
  const captured = captureWorkspaceDrop({
    files: [],
    items: [item],
    getData: () => "",
  });
  inDropEvent = false;
  expect((await captured).paths).toEqual(["/home/test/Downloads/skin.zip"]);
});

test("reads file-manager VPK links from HTML when the URI-list item is empty", async () => {
  const values = new Map([
    ["text/uri-list", ""],
    [
      "text/html",
      '<a style="color: white">file:///home/test/Downloads/abiltesting-compatibility-test.vpk</a>',
    ],
  ]);
  const items: DataTransferItem[] = [...values].map(([type, value]) => ({
    kind: "string",
    type,
    getAsFile: () => null,
    webkitGetAsEntry: () => null,
    getAsString: (callback) => queueMicrotask(() => callback?.(value)),
  }));
  const drop = await captureWorkspaceDrop({
    files: [],
    items,
    getData: () => "",
  });
  expect(drop.paths).toEqual([
    "/home/test/Downloads/abiltesting-compatibility-test.vpk",
  ]);
});

test("main workspace accepts external VPKs without capturing addon file moves", () => {
  expect(acceptsWorkspaceDrop(["Files"], false)).toBe(true);
  expect(acceptsWorkspaceDrop(["text/uri-list"], false)).toBe(true);
  expect(acceptsWorkspaceDrop([ADDON_FILE_DRAG, "Files"], false)).toBe(false);
  expect(acceptsWorkspaceDrop([ADDON_FILE_DRAG], true)).toBe(true);
});

function routeFiles(files: File[]) {
  return workspaceDropRoute(
    { types: ["Files"], files, items: [], getData: () => "" },
    false,
    "current",
  );
}

test("PNG and GIF drops reach child projection and import targets before fallback", () => {
  for (const name of ["texture.png", "animation.gif"]) {
    const route = routeFiles([new File(["image"], name)]);
    expect(handlesWorkspaceDrop(route, "capture", false)).toBe(false);
    expect(handlesWorkspaceDrop(route, "bubble", true)).toBe(false);
    expect(handlesWorkspaceDrop(route, "bubble", false)).toBe(true);
  }
});

test("VPK and package drops take priority over file-tree imports", () => {
  for (const name of ["skin.VPK", "skin.zip", "skin.7z", "skin.dmodpkg"]) {
    const route = routeFiles([new File(["archive"], name)]);
    expect(handlesWorkspaceDrop(route, "capture", false)).toBe(true);
    expect(handlesWorkspaceDrop(route, "bubble", false)).toBe(false);
  }
  const file = new File(["vpk"], "");
  Object.defineProperty(file, "webkitRelativePath", {
    value: "/home/test/skin_dir.vpk",
  });
  expect(routeFiles([file])).toBe("capture");
});

test("URI VPKs take priority and internal moves stay in their workspace", () => {
  const transfer = {
    types: ["text/uri-list"],
    files: [],
    items: [],
    getData: (type: string) =>
      type === "text/uri-list" ? "file:///home/test/skin.vpk" : "",
  };
  expect(workspaceDropRoute(transfer, false, "current")).toBe("capture");
  for (const comparison of [true, false]) {
    const internal = {
      types: [ADDON_FILE_DRAG],
      files: [],
      items: [],
      getData: () =>
        JSON.stringify({
          addonId: "addon",
          workspaceId: "current",
          hierarchy: "content",
          path: "models/a.vmdl",
        }),
    };
    expect(workspaceDropRoute(internal, comparison, "current")).toBe("ignore");
  }
});
