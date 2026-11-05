import { expect, test } from "bun:test";
import {
  selectModelMaterial,
  type ModelMaterialSelection,
} from "./model-material-selection";

const names = ["backpack", "head", "body", "smoke", "gun"];
const initial = (): ModelMaterialSelection => ({
  materials: new Set(["backpack"]),
  active: "backpack",
  anchor: "backpack",
});

test("material selection replaces, adds, removes and permits an empty selection", () => {
  const head = selectModelMaterial(initial(), "head", names);
  expect([...head.materials]).toEqual(["head"]);
  const pair = selectModelMaterial(head, "body", names, { toggle: true });
  expect([...pair.materials]).toEqual(["head", "body"]);
  expect(pair.active).toBe("body");
  const removed = selectModelMaterial(pair, "body", names, { toggle: true });
  expect(removed.active).toBe("head");
  const empty = selectModelMaterial(removed, "head", names, { toggle: true });
  expect(empty.materials.size).toBe(0);
  expect(empty.active).toBe("");
});

test("Shift ranges use the anchor and visible order, including reverse and additive ranges", () => {
  const range = selectModelMaterial(initial(), "smoke", names, { range: true });
  expect([...range.materials]).toEqual(names.slice(0, 4));
  expect(range.anchor).toBe("backpack");
  const reverse = selectModelMaterial(
    { materials: new Set(["gun"]), active: "gun", anchor: "gun" },
    "body",
    names,
    { range: true },
  );
  expect([...reverse.materials]).toEqual(["body", "smoke", "gun"]);
  const additive = selectModelMaterial(
    { materials: new Set(["gun"]), active: "gun", anchor: "head" },
    "body",
    names,
    { toggle: true, range: true },
  );
  expect([...additive.materials]).toEqual(["gun", "head", "body"]);
  const filtered = selectModelMaterial(initial(), "gun", ["head", "gun"], {
    range: true,
  });
  expect([...filtered.materials]).toEqual(["gun"]);
});
