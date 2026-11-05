import { z } from "zod";

const previewFailure = z.object({
  kind: z.enum([
    "previewMissingAssets",
    "previewCorruptArchive",
    "previewCorruptOverride",
    "previewUnsupported",
  ]),
});

export const previewFailureLabel = (error: Error | null): string => {
  const parsed = previewFailure.safeParse(error);
  return parsed.success
    ? `modPreview.failures.${parsed.data.kind}`
    : "modPreview.failures.unavailable";
};
