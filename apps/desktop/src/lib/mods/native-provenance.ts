import type { NativeSourceProvenance } from "@/types/generated/NativeSourceProvenance";

/** Catalog metadata cannot establish which revision recovered files contain. */
export const unresolvedNativeProvenance = (
  source: NativeSourceProvenance,
): NativeSourceProvenance => ({
  ...source,
  releaseId: "",
  contentRevision: "",
  artifactIds: [],
  componentIds: [],
});
