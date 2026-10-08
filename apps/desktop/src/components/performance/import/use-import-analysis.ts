import { useMutation } from "@tanstack/react-query";
import { analytics } from "@/lib/analytics";
import { failureOutcome } from "@/lib/analytics/client";
import { analyzePerfImport } from "@/lib/performance/api";
import {
  type ImportModContext,
  importAnalyticsSourceKind,
} from "@/lib/performance/import/save";
import { isTauriError } from "@/types/tauri";
import type { ImportReport } from "@/types/generated/ImportReport";
import type { ImportSource } from "@/types/generated/ImportSource";

type ImportAnalysisVariables = {
  source: ImportSource;
  /** The source the user started from; differs from `source` after picking an archive variant. */
  root: ImportSource;
  context: ImportModContext | null;
};

/**
 * Reads a config for review. Failures render inline in the dialog, not as
 * toasts. `onStaged` runs for every analysis that stages an archive, including
 * ones the dialog has since moved on from, so their folders still get cleaned up.
 */
export const useImportAnalysis = (onStaged: (stagingId: string) => void) =>
  useMutation<ImportReport, Error, ImportAnalysisVariables>({
    mutationFn: async ({ source, root, context }) => {
      const attempt = analytics.start("performance_config_import", {
        source_kind: importAnalyticsSourceKind(root, context),
      });
      try {
        const report = await analyzePerfImport(source);
        attempt.finish("completed", {
          format: report.format,
          setting_count: report.entries.length,
          ignored_count: report.ignored.length,
        });
        return report;
      } catch (error) {
        attempt.finish(
          failureOutcome(isTauriError(error) ? error.kind : undefined),
        );
        throw error;
      }
    },
    onSuccess: (report) => {
      if (report.stagingId) onStaged(report.stagingId);
    },
    meta: { skipGlobalErrorHandler: true },
  });
