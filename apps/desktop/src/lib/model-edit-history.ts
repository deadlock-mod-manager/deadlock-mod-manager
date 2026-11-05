import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import { replaceEqualDeep } from "@tanstack/react-query";

export const modelEditsEqual = (
  a: readonly ModdingModelPartEdit[],
  b: readonly ModdingModelPartEdit[],
) => replaceEqualDeep(a, b) === a;

export interface ModelEditHistory {
  edits: ModdingModelPartEdit[];
  past: ModdingModelPartEdit[][];
  future: ModdingModelPartEdit[][];
}
export type ModelEditAction =
  | { type: "change"; edits: ModdingModelPartEdit[] }
  | { type: "undo" }
  | { type: "redo" };
export function modelEditHistory(
  state: ModelEditHistory,
  action: ModelEditAction,
): ModelEditHistory {
  if (action.type === "change") {
    if (modelEditsEqual(state.edits, action.edits)) return state;
    return {
      edits: action.edits,
      past: [...state.past, state.edits].slice(-100),
      future: [],
    };
  }
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous
      ? {
          edits: previous,
          past: state.past.slice(0, -1),
          future: [state.edits, ...state.future],
        }
      : state;
  }
  const next = state.future[0];
  return next
    ? {
        edits: next,
        past: [...state.past, state.edits],
        future: state.future.slice(1),
      }
    : state;
}
export const resetModelPart = (material: string): ModdingModelPartEdit => ({
  material,
  hidden: false,
  tint: null,
  recolor: null,
  roughness: null,
  metalness: null,
  pattern: null,
  paint: null,
  parameters: [],
  expressions: [],
});
