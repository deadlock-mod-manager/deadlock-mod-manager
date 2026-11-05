import { describe, expect, test } from "bun:test";
import { modelEditShortcut, type ModelEditKey } from "./model-edit-shortcuts";
const key = (values: Partial<ModelEditKey> = {}): ModelEditKey => ({
  key: "z",
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...values,
});
describe("model edit shortcuts", () => {
  test("supports undo and both redo conventions", () => {
    expect(modelEditShortcut(key(), false)).toBe("undo");
    expect(modelEditShortcut(key({ shiftKey: true }), false)).toBe("redo");
    expect(modelEditShortcut(key({ key: "y" }), false)).toBe("redo");
    expect(
      modelEditShortcut(
        key({ ctrlKey: false, metaKey: true, key: "Z" }),
        false,
      ),
    ).toBe("undo");
  });
  test("leaves native text undo and unrelated keyboard gestures alone", () => {
    expect(modelEditShortcut(key(), true)).toBeNull();
    expect(
      modelEditShortcut(key({ defaultPrevented: true }), false),
    ).toBeNull();
    expect(modelEditShortcut(key({ altKey: true }), false)).toBeNull();
    expect(modelEditShortcut(key({ ctrlKey: false }), false)).toBeNull();
  });
});
