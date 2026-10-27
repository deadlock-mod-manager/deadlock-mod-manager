import { expect, test } from "bun:test";
import { captureWorkspaceDrop } from "./modding-workspace-drop";

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
