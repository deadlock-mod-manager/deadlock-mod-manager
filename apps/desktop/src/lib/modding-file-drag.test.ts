import { expect, test } from "bun:test";
import { addonMoveDestination, readAddonDrag } from "./modding-file-drag";

test("tree moves preserve names and reject self or descendant destinations", () => {
  expect(addonMoveDestination("models/hero.dmx", "meshes")).toBe(
    "meshes/hero.dmx",
  );
  expect(addonMoveDestination("models/hero.dmx", "")).toBe("hero.dmx");
  expect(addonMoveDestination("models/hero.dmx", "models")).toBeNull();
  expect(addonMoveDestination("models", "models/subfolder")).toBeNull();
  expect(addonMoveDestination("models", "models")).toBeNull();
  expect(addonMoveDestination("models", "models2")).toBe("models2/models");
});

test("ignores malformed or unrelated drag payloads", () => {
  expect(readAddonDrag("bad json")).toBeNull();
  expect(readAddonDrag('{"path":"test.txt"}')).toBeNull();
  expect(
    readAddonDrag(
      JSON.stringify({ addonId: "a", hierarchy: "content", path: "test.txt" }),
    )?.path,
  ).toBe("test.txt");
});
