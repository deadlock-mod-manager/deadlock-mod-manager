import { expect, test } from "bun:test";
import {
  applyModelMaterialChange,
  commonModelMaterialPart,
} from "./model-material-bulk-edit";
import {
  applyToonPreset,
  applyReactivePreset,
  TOON_PARAMETERS,
} from "./model-material-presets";
import { modelEditHistory, resetModelPart } from "./model-edit-history";
import type { ModdingModelPart } from "@/types/generated/ModdingModelPart";
import type { ModdingMaterialControl } from "@/types/generated/ModdingMaterialControl";

const control = (name: string): ModdingMaterialControl => ({
  name,
  kind: "scalar",
  group: "surface",
  min: 0,
  max: 10,
  values: [1],
  expression: null,
});
const part = (material: string): ModdingModelPart => ({
  material,
  tintable: true,
  roughnessEditable: true,
  metalnessEditable: true,
  diagnostic: null,
  controls: [
    control("F_SELF_ILLUM"),
    control("g_flSelfIllumScale1"),
    control("g_vAlbedoScrollSpeed1"),
  ],
  attributes: ["$ent_health"],
});
const selection = new Set(["body", "head"]);
const parts = [part("body"), part("head"), part("gun")];
const edits = () => [
  resetModelPart("body"),
  resetModelPart("head"),
  resetModelPart("gun"),
];

test("bulk finish updates retain other values and unselected materials; Undo restores the whole operation", () => {
  const before = edits();
  before[1] = { ...before[1], tint: "#ff0000", metalness: 0.8, roughness: 0.9 };
  const changed = applyModelMaterialChange(before, parts, selection, {
    ...before[0],
    roughness: 0.4,
  });
  expect(changed[0].roughness).toBe(0.4);
  expect(changed[1]).toEqual({ ...before[1], roughness: 0.4 });
  expect(changed[2]).toBe(before[2]);
  const history = modelEditHistory(
    { edits: before, past: [], future: [] },
    { type: "change", edits: changed },
  );
  expect(history.past).toHaveLength(1);
  expect(modelEditHistory(history, { type: "undo" }).edits).toEqual(before);
  expect(
    modelEditHistory(modelEditHistory(history, { type: "undo" }), {
      type: "redo",
    }).edits,
  ).toEqual(changed);
});

test("bulk recolor and pattern adjustments preserve each target's other nested values and paint", () => {
  const before = edits();
  before[0].recolor = { color: "#ffffff", brightness: 1, saturation: 1 };
  before[1].recolor = { color: "#00ff00", brightness: 0.5, saturation: 0.2 };
  before[0].pattern = {
    style: "liquid",
    intensity: 0.7,
    phase: 0,
    scroll: [0, 0],
  };
  before[1].pattern = {
    style: "thermal",
    intensity: 0.2,
    phase: 2,
    scroll: [1, 1],
  };
  before[1].paint = { layers: [] };
  const changed = applyModelMaterialChange(before, parts, selection, {
    ...before[0],
    recolor: { ...before[0].recolor, brightness: 1.5 },
    pattern: { ...before[0].pattern, intensity: 0.9 },
  });
  expect(changed[1].recolor).toEqual({
    color: "#00ff00",
    brightness: 1.5,
    saturation: 0.2,
  });
  expect(changed[1].pattern).toEqual({
    style: "thermal",
    intensity: 0.9,
    phase: 2,
    scroll: [1, 1],
  });
  expect(changed[1].paint).toBe(before[1].paint);
});

test("bulk expressions replace conflicting static values while preserving unrelated overrides", () => {
  const before = edits();
  before[1].parameters = [
    { name: "g_flSelfIllumScale1", values: [8] },
    { name: "F_SELF_ILLUM", values: [1] },
  ];
  const changed = applyModelMaterialChange(before, parts, selection, {
    ...before[0],
    expressions: [{ name: "g_flSelfIllumScale1", source: "time()" }],
  });
  expect(changed[1].parameters).toEqual([
    { name: "F_SELF_ILLUM", values: [1] },
  ]);
  expect(changed[1].expressions).toEqual([
    { name: "g_flSelfIllumScale1", source: "time()" },
  ]);
  const staticChange = applyModelMaterialChange(changed, parts, selection, {
    ...changed[0],
    expressions: [],
    parameters: [{ name: "g_flSelfIllumScale1", values: [2] }],
  });
  expect(staticChange[1].expressions).toEqual([]);
  expect(staticChange[1].parameters).toContainEqual({
    name: "g_flSelfIllumScale1",
    values: [2],
  });
});

test("enabling a pattern clears scroll conflicts that only exist on another selected part", () => {
  const before = edits();
  before[1].expressions = [
    { name: "g_vAlbedoScrollSpeed1", source: "float2(1, 0)" },
  ];
  const changed = applyModelMaterialChange(before, parts, selection, {
    ...before[0],
    pattern: { style: "liquid", intensity: 0.7, phase: 0, scroll: [0, 0] },
  });
  expect(changed[1].expressions).toEqual([]);
  expect(changed[1].pattern).toEqual(changed[0].pattern);
});

test("unsupported channels are not copied and visibility of an unselected row remains independent", () => {
  const before = edits();
  const unsupported = {
    ...part("head"),
    tintable: false,
    roughnessEditable: false,
    metalnessEditable: false,
    controls: [],
  };
  const changed = applyModelMaterialChange(
    before,
    [parts[0], unsupported, parts[2]],
    selection,
    {
      ...before[0],
      tint: "#ffffff",
      roughness: 0.4,
      metalness: 1,
      parameters: [{ name: "F_SELF_ILLUM", values: [1] }],
    },
  );
  expect(changed[1]).toEqual(before[1]);
  const eye = applyModelMaterialChange(before, parts, selection, {
    ...before[2],
    hidden: true,
  });
  expect(eye[0]).toBe(before[0]);
  expect(eye[1]).toBe(before[1]);
  expect(eye[2].hidden).toBe(true);
});

test("shared controls require compatible types and ranges and honor locked authored expressions", () => {
  const active = {
    ...part("body"),
    controls: [
      { ...control("F_SELF_ILLUM"), min: 0, max: 5 },
      control("g_flSelfIllumScale1"),
    ],
  };
  const other = {
    ...part("head"),
    tintable: false,
    controls: [{ ...control("F_SELF_ILLUM"), min: 1, max: 3, expression: "1" }],
    attributes: [],
  };
  const common = commonModelMaterialPart(active, [active, other]);
  expect(common.tintable).toBe(false);
  expect(common.attributes).toEqual([]);
  expect(common.controls).toHaveLength(1);
  expect(common.controls[0]).toMatchObject({ min: 1, max: 3, expression: "1" });
});

test("presets reapply to every material even when the active material already has those values", () => {
  const supported = {
    ...part("body"),
    controls: TOON_PARAMETERS.map((p) => control(p.name)),
  };
  const source = applyToonPreset(supported, resetModelPart("body"));
  const head = resetModelPart("head");
  const result = [source, head].map((edit) =>
    applyToonPreset({ ...supported, material: edit.material }, edit),
  );
  expect(result[0]).toEqual(source);
  expect(result[1].roughness).toBe(1);
  expect(result[1].parameters).toContainEqual({
    name: "F_USE_STATUS_EFFECTS_PROXY",
    values: [1],
  });
  expect(applyReactivePreset(part("head"), head, "time()").expressions).toEqual(
    [{ name: "g_flSelfIllumScale1", source: "time()" }],
  );
  expect(
    applyReactivePreset({ ...part("head"), controls: [] }, head, "time()"),
  ).toBe(head);
});

test("changing a property unsupported by another part does not erase that part's existing expression", () => {
  const before = edits();
  before[1].expressions = [{ name: "g_flSelfIllumScale1", source: "8" }];
  const restricted = { ...part("head"), controls: [control("F_SELF_ILLUM")] };
  const changed = applyModelMaterialChange(
    before,
    [parts[0], restricted, parts[2]],
    selection,
    {
      ...before[0],
      parameters: [{ name: "g_flSelfIllumScale1", values: [2] }],
    },
  );
  expect(changed[1].expressions).toEqual(before[1].expressions);
  expect(changed[1].parameters).toEqual([]);
});

test("resetting selected parts restores their paint and recipes in one Undo step", () => {
  const before = edits();
  before[1] = { ...before[1], tint: "#ff0000", paint: { layers: [] } };
  before[2] = { ...before[2], metalness: 1 };
  const reset = before.map((edit) =>
    selection.has(edit.material) ? resetModelPart(edit.material) : edit,
  );
  const history = modelEditHistory(
    { edits: before, past: [], future: [] },
    { type: "change", edits: reset },
  );
  expect(history.edits[0]).toEqual(resetModelPart("body"));
  expect(history.edits[1]).toEqual(resetModelPart("head"));
  expect(history.edits[2]).toBe(before[2]);
  expect(modelEditHistory(history, { type: "undo" }).edits).toEqual(before);
});
