import { expect, test } from "bun:test";
import {
  modelEditHistory,
  modelEditsEqual,
  resetModelPart,
  type ModelEditHistory,
} from "./model-edit-history";

test("IPC object key ordering does not turn restored material recipes into dirty edits", () => {
  const original = resetModelPart("body");
  const restored = { ...original, paint: null };
  const { material, ...rest } = restored;
  const reordered = { ...rest, material };
  expect(modelEditsEqual([original], [reordered])).toBe(true);
  const state: ModelEditHistory = { edits: [original], past: [], future: [] };
  expect(modelEditHistory(state, { type: "change", edits: [reordered] })).toBe(
    state,
  );
});

test("undo and redo preserve independent material drafts and new changes discard redo", () => {
  const initial: ModelEditHistory = {
    edits: [resetModelPart("body"), resetModelPart("head")],
    past: [],
    future: [],
  };
  const painted = modelEditHistory(initial, {
    type: "change",
    edits: [{ ...initial.edits[0], tint: "#22aaff" }, initial.edits[1]],
  });
  const hidden = modelEditHistory(painted, {
    type: "change",
    edits: [painted.edits[0], { ...painted.edits[1], hidden: true }],
  });
  const undone = modelEditHistory(hidden, { type: "undo" });
  expect(undone.edits).toEqual(painted.edits);
  expect(modelEditHistory(undone, { type: "redo" }).edits).toEqual(
    hidden.edits,
  );
  const changed = modelEditHistory(undone, {
    type: "change",
    edits: initial.edits,
  });
  expect(changed.future).toEqual([]);
  expect(modelEditHistory(initial, { type: "undo" })).toBe(initial);
});

test("discard returns to the saved recipe and clears unsaved undo history", () => {
  const saved = [{ ...resetModelPart("body"), roughness: 0.75 }];
  const changed = modelEditHistory(
    { edits: saved, past: [], future: [] },
    { type: "change", edits: [{ ...saved[0], roughness: 0.2 }] },
  );
  const discarded = modelEditHistory(changed, { type: "reset", edits: saved });
  expect(discarded.edits).toBe(saved);
  expect(discarded.past).toEqual([]);
  expect(discarded.future).toEqual([]);
  expect(modelEditHistory(discarded, { type: "undo" })).toBe(discarded);
});
