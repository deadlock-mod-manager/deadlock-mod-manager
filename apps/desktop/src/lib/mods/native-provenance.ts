import type { NativeSourceProvenance } from "@/types/generated/NativeSourceProvenance";

export const unresolvedNativeProvenance = (
  source: NativeSourceProvenance,
): NativeSourceProvenance => ({
  ...source,
  releaseId: "",
  contentRevision: "",
  artifactIds: [],
  componentIds: [],
});
