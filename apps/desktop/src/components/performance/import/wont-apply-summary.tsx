import {
  commonSinceBuild,
  entryDisplayName,
} from "@/lib/performance/import/review";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { useTranslation } from "react-i18next";

const firstName = (entries: ResolvedEntry[]) =>
  entries[0] ? entryDisplayName(entries[0].path) : "";

export const WontApplySummary = ({
  blocked,
  removed,
  refused,
}: {
  blocked: ResolvedEntry[];
  removed: ResolvedEntry[];
  refused: ResolvedEntry[];
}) => {
  const { t } = useTranslation();
  const build = commonSinceBuild(blocked);
  const sentences = [
    blocked.length > 0 &&
      (build === null
        ? t("performance.import.review.wontApply.blocked", {
            count: blocked.length,
            example: firstName(blocked),
          })
        : t("performance.import.review.wontApply.blockedSince", {
            count: blocked.length,
            build,
            example: firstName(blocked),
          })),
    removed.length > 0 &&
      t("performance.import.review.wontApply.removed", {
        count: removed.length,
        example: firstName(removed),
      }),
    refused.length > 0 &&
      t("performance.import.review.wontApply.refused", {
        count: refused.length,
      }),
  ].filter(Boolean);
  return <>{sentences.join(" ")}</>;
};
