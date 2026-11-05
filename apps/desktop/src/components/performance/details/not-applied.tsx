import { ProhibitIcon, XCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  engineSectionEdits,
  entriesWithStatus,
  LEFT_OUT_STATUSES,
  UNREAD_STATUSES,
} from "@/lib/performance/resolved-summary";
import type { ResolvedConfig } from "@/types/generated/ResolvedConfig";
import { DetailsSection } from "./details-parts";
import { EngineSectionsCard } from "./engine-sections-card";
import { EntryReasonList } from "./entry-reason-list";

/** Engine-section edits, settings the game doesn't read, and lines we never write. */
export const NotApplied = ({
  configId,
  resolved,
}: {
  configId: string;
  resolved: ResolvedConfig;
}) => {
  const { t } = useTranslation();
  const unread = entriesWithStatus(resolved.entries, UNREAD_STATUSES);
  const leftOut = entriesWithStatus(resolved.entries, LEFT_OUT_STATUSES);
  const hasEngineEdits = engineSectionEdits(resolved.entries).count > 0;

  if (!hasEngineEdits && unread.length === 0 && leftOut.length === 0) {
    return null;
  }

  const { blocked, removed, notConvar } = resolved.counts;
  const unreadParts: string[] = [];
  if (blocked > 0) {
    unreadParts.push(
      t("performance.details.unread.blocked", { count: blocked }),
    );
  }
  if (removed > 0) {
    unreadParts.push(
      t("performance.details.unread.removed", { count: removed }),
    );
  }
  if (notConvar > 0) {
    unreadParts.push(
      t("performance.details.unread.notConvar", { count: notConvar }),
    );
  }

  return (
    <DetailsSection title={t("performance.details.notApplied.title")}>
      <EngineSectionsCard configId={configId} resolved={resolved} />
      {unread.length > 0 && (
        <EntryReasonList
          entries={unread}
          icon={<ProhibitIcon aria-hidden className='text-amber-400' />}
          summary={unreadParts.join(", ")}
          title={t("performance.details.unread.title", {
            count: unread.length,
          })}
        />
      )}
      {leftOut.length > 0 && (
        <EntryReasonList
          entries={leftOut}
          icon={<XCircleIcon aria-hidden className='text-muted-foreground' />}
          summary={t("performance.details.leftOut.summary")}
          title={t("performance.details.leftOut.title", {
            count: leftOut.length,
          })}
        />
      )}
    </DetailsSection>
  );
};
