import { expect, test } from "bun:test";
import {
  droppedPaths,
  emptyWorkspace,
  readWorkspaceSnapshot,
  readWorkspaceSource,
  workspaceForSource,
  sourceKey,
} from "./modding-workspace";

test("comparison handoff preserves the addon hierarchy, file and archive selection", () => {
  const state = workspaceForSource({
    kind: "addon",
    addonId: "bees",
    hierarchy: "game",
    path: "models/skull.vmdl_c",
  });
  state.view.directory = "models";
  state.view.search = "skull.*";
  state.view.regex = true;
  state.view.selection = [
    { path: "models", directory: true, selected: true, fileCount: 3 },
  ];
  expect(readWorkspaceSnapshot(JSON.stringify(state))).toEqual(state);
});

test("malformed source payloads cannot replace the current workspace", () => {
  expect(readWorkspaceSource("not json")).toBeNull();
  expect(readWorkspaceSource('{"kind":"archive","filePath":12}')).toBeNull();
  expect(readWorkspaceSnapshot('{"source":{"kind":"addon"}}')).toEqual(
    emptyWorkspace(),
  );
});

test("machine drops decode Linux, Windows and network file URIs without treating remote URLs as files", () => {
  expect(
    droppedPaths(
      "# paths\r\nfile:///home/test/My%20Addon\r\nfile:///C:/Mods/a.vpk\nfile://server/share/model.dmx\nhttps://example.com/file.vpk",
    ),
  ).toEqual([
    "/home/test/My Addon",
    "C:/Mods/a.vpk",
    "//server/share/model.dmx",
  ]);
  expect(
    droppedPaths("C:\\mods\\file.vpk\n/home/test/a.wav\nfile:///bad%xx"),
  ).toEqual(["C:\\mods\\file.vpk", "/home/test/a.wav"]);
});

test("multiple loose assets in one folder remain independently selectable after detaching", () => {
  const addon = {
    id: "local:fixture",
    name: "fixtures",
    sdkRoot: "",
    contentPath: "/fixtures",
    gamePath: "/fixtures",
    archivePath: "/base.vpk",
  };
  const image = workspaceForSource({ kind: "local", addon, path: "a.png" });
  const audio = workspaceForSource({ kind: "local", addon, path: "b.wav" });
  image.recent = [image.source, audio.source].filter(
    (source) => source !== null,
  );
  const restored = readWorkspaceSnapshot(JSON.stringify(image));
  expect(restored.recent).toHaveLength(2);
  expect(new Set(restored.recent.map(sourceKey)).size).toBe(2);
});
