import { expect, test } from "bun:test";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import {
  dirtyParticleFiles,
  particleHex,
  particleReducer,
  particleRgb,
  particleSession,
  sharedParticleColors,
  type ParticleRgb,
  selectParticleFile,
  particleInFolder,
  particleFolders,
  recolorParticleFiles,
  type ParticleFileSelection,
  initialParticleSelection,
  selectParticleFolder,
  planParticleColors,
} from "./particle-colors";
function file(
  path: string,
  rgb: ParticleRgb,
  text = particleHex(rgb),
): ModdingParticleFile {
  return {
    path,
    text,
    fingerprint: text,
    colors: [{ path: "m_Color1", rgb, alpha: 123, normalized: false }],
    diagnostic: null,
  };
}

test("initial All folders and reselected All folders expose the same batch colors", () => {
  const documents = [
    { ...file("particles/empty.vpcf", [0, 0, 0]), colors: [] },
    file("particles/fx/a.vpcf", [255, 100, 50]),
    file("particles/fx/b.vpcf", [255, 100, 50]),
  ];
  const initial = initialParticleSelection(documents);
  const folder = selectParticleFolder(documents, "particles");
  const all = selectParticleFolder(documents, "");
  const colors = (selection: ParticleFileSelection) =>
    sharedParticleColors(
      documents.filter((file) => selection.paths.has(file.path)),
      0,
    );
  expect(colors(initial)).toEqual(colors(all));
  expect(colors(initial)).toHaveLength(1);
  expect([...initial.paths]).toEqual([...all.paths]);
  expect(colors(folder)).toEqual(colors(all));
});

test("opening one particle explicitly keeps single-file selection", () => {
  const documents = [
    file("particles/a.vpcf", [1, 2, 3]),
    file("particles/b.vpcf", [1, 2, 3]),
  ];
  expect([
    ...initialParticleSelection(documents, "particles/b.vpcf").paths,
  ]).toEqual(["particles/b.vpcf"]);
});
test("shared colors count files separately and expand only within the chosen tolerance", () => {
  const files = [
    file("a.vpcf", [255, 0, 0]),
    file("b.vpcf", [254, 1, 0]),
    file("c.vpcf", [0, 0, 255]),
  ];
  expect(sharedParticleColors(files, 0)).toHaveLength(0);
  const [group] = sharedParticleColors(files, 1);
  expect(group?.files).toEqual(["b.vpcf", "a.vpcf"]);
  expect(group?.fields).toHaveLength(2);
  expect(group?.fields.map((field) => field.color.alpha)).toEqual([123, 123]);
  expect(sharedParticleColors(files.slice(0, 1), 100)).toHaveLength(0);
});
test("Ctrl/Cmd toggles and Shift ranges follow visible order and preserve the anchor", () => {
  const visible = ["a.vpcf", "b.vpcf", "c.vpcf", "d.vpcf"];
  let selection: ParticleFileSelection = {
    active: "a.vpcf",
    anchor: "a.vpcf",
    paths: new Set(["a.vpcf"]),
  };
  const normal = { shiftKey: false, ctrlKey: false, metaKey: false };
  selection = selectParticleFile(selection, "c.vpcf", visible, {
    ...normal,
    shiftKey: true,
  });
  expect([...selection.paths]).toEqual(visible.slice(0, 3));
  expect(selection.anchor).toBe("a.vpcf");
  selection = selectParticleFile(selection, "b.vpcf", visible, {
    ...normal,
    ctrlKey: true,
  });
  expect([...selection.paths]).toEqual(["a.vpcf", "c.vpcf"]);
  selection = selectParticleFile(selection, "d.vpcf", visible, {
    ...normal,
    metaKey: true,
  });
  expect([...selection.paths]).toEqual(["a.vpcf", "c.vpcf", "d.vpcf"]);
  selection = selectParticleFile(selection, "c.vpcf", ["a.vpcf", "c.vpcf"], {
    ...normal,
    shiftKey: true,
  });
  expect([...selection.paths]).toEqual(["c.vpcf"]);
});
test("folder batch recoloring excludes siblings and keeps field identities and alpha", () => {
  const files = [
    file("particles/haze/a.vpcf", [100, 0, 0]),
    file("particles/haze/sub/b.vpcf", [0, 0, 100]),
    file("particles/haze_other/c.vpcf", [0, 100, 0]),
  ];
  const selected = files.filter((file) =>
    particleInFolder(file.path, "particles/haze"),
  );
  expect(particleFolders(files)).toEqual([
    "particles",
    "particles/haze",
    "particles/haze/sub",
    "particles/haze_other",
  ]);
  const edits = recolorParticleFiles(selected, [1, 2, 3]);
  expect(edits.map((edit) => edit.path)).toEqual(
    files.slice(0, 2).map((file) => file.path),
  );
  expect(edits.map((edit) => edit.changes)).toEqual([
    [{ path: "m_Color1", rgb: [1, 2, 3] }],
    [{ path: "m_Color1", rgb: [1, 2, 3] }],
  ]);
  expect(files.map((file) => file.colors[0]?.alpha)).toEqual([123, 123, 123]);
});
test("batch undo/redo restores exact source text and saving one file keeps other drafts dirty", () => {
  const before = [
    file("a.vpcf", [0, 0, 0], "// original A"),
    file("b.vpcf", [0, 0, 0], "// original B"),
  ];
  const after = [
    file("a.vpcf", [1, 2, 3], "// edited A"),
    file("b.vpcf", [1, 2, 3], "// edited B"),
  ];
  let state = particleReducer(particleSession(before), {
    type: "edit",
    files: after,
    label: "replace",
    at: 1,
  });
  expect(dirtyParticleFiles(state)).toHaveLength(2);
  state = particleReducer(state, { type: "undo" });
  expect([...state.files.values()].map((file) => file.text)).toEqual(
    before.map((file) => file.text),
  );
  state = particleReducer(state, { type: "redo" });
  state = particleReducer(state, {
    type: "saved",
    paths: ["a.vpcf"],
    label: "save",
    at: 2,
  });
  expect(dirtyParticleFiles(state).map((file) => file.path)).toEqual([
    "b.vpcf",
  ]);
  expect(state.baseline.get("a.vpcf")?.fingerprint).toBe("// edited A");
  state = particleReducer(state, { type: "undo" });
  expect(dirtyParticleFiles(state).map((file) => file.path)).toEqual([
    "a.vpcf",
  ]);
});
test("new edits clear redo history and no-op edits do not create history", () => {
  const original = file("a.vpcf", [10, 20, 30]);
  let state = particleSession([original]);
  state = particleReducer(state, {
    type: "edit",
    files: [original],
    label: "noop",
    at: 1,
  });
  expect(state.past).toHaveLength(0);
  state = particleReducer(state, {
    type: "edit",
    files: [file("a.vpcf", [1, 2, 3])],
    label: "edit",
    at: 2,
  });
  state = particleReducer(state, { type: "undo", label: "undo", at: 3 });
  state = particleReducer(state, {
    type: "edit",
    files: [file("a.vpcf", [4, 5, 6])],
    label: "branch",
    at: 4,
  });
  expect(state.future).toHaveLength(0);
  expect(new Set(state.log.map((entry) => entry.id)).size).toBe(
    state.log.length,
  );
});
test("hex input supports shorthand and rejects malformed colors", () => {
  expect(particleRgb("#f80")).toEqual([255, 136, 0]);
  expect(particleRgb("#aabbcc")).toEqual([170, 187, 204]);
  expect(particleRgb("bad hex")).toBeNull();
});

test("recolor proposals count only changed fields and selected, valid files", () => {
  const a = file("particles/a.vpcf", [10, 20, 30]);
  a.colors.push({
    path: "m_Color2",
    rgb: [1, 2, 3],
    alpha: null,
    normalized: false,
  });
  const b = file("particles/b.vpcf", [10, 20, 30]);
  const broken = {
    ...file("particles/broken.vpcf", [10, 20, 30]),
    diagnostic: "invalid source",
  };
  const matching = planParticleColors(
    [a, b, broken],
    [1, 2, 3],
    [{ file: a.path, path: "m_Color1" }],
  );
  expect(matching.files).toEqual([a.path]);
  expect(matching.fields).toBe(1);
  expect(matching.edits[0]?.changes).toEqual([
    { path: "m_Color1", rgb: [1, 2, 3] },
  ]);
  const all = planParticleColors([a, b, broken], [1, 2, 3]);
  expect(all.files).toEqual([a.path, b.path]);
  expect(all.fields).toBe(2);
  expect(a.colors[0]?.rgb).toEqual([10, 20, 30]);
  expect(a.colors[0]?.alpha).toBe(123);
});
