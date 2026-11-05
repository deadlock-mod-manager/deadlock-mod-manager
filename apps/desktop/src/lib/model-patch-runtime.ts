import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import type { ModelImageProjectionFrame } from "./model-image-projection";

export interface ModelPatchImage {
  frames: readonly ModelImageProjectionFrame[];
  plays: number;
}
export interface ModelPatchEntry {
  material: string;
  patch: ModdingModelPatch;
  hidden: boolean;
}
export type ModelPatchSelection =
  | { kind: "placing"; material: string; patch: ModdingModelPatch }
  | { kind: "selected"; id: string; mode: "translate" | "rotate" | "scale" }
  | null;
export interface ModelPatchRuntime {
  entries: readonly ModelPatchEntry[];
  images: ReadonlyMap<string, ModelPatchImage>;
  selection: ModelPatchSelection;
  fitRequest: { id: string; revision: number } | null;
  onPlace: (material: string, patch: ModdingModelPatch) => void;
  onChange: (material: string, patch: ModdingModelPatch) => void;
  onCancel: () => void;
  onManipulating: (active: boolean) => void;
}
