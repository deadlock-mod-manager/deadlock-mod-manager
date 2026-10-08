import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";

export const DetailsSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className='flex flex-col gap-3'>
    <div>
      <h3 className='font-semibold text-sm'>{title}</h3>
      {description && (
        <p className='text-muted-foreground text-xs'>{description}</p>
      )}
    </div>
    {children}
  </section>
);

/** Convar name, or `Section.Key` for engine-section edits. */
export const entryKey = (entry: ResolvedEntry) =>
  entry.path[0]?.toLowerCase() === "convars"
    ? entry.path.slice(1).join(".")
    : entry.path.join(".");

export const EntryKey = ({
  entry,
  className,
}: {
  entry: ResolvedEntry;
  className?: string;
}) => (
  <span
    className={cn("truncate font-mono text-xs", className)}
    title={entry.meta?.label ?? entry.meta?.description ?? undefined}>
    {entryKey(entry)}
  </span>
);

/** Why an entry isn't written, from its status and notes. */
export const useEntryReason = () => {
  const { t } = useTranslation();
  return (entry: ResolvedEntry): string => {
    const since = entry.notes.find((note) => note.kind === "sinceBuild");
    const sinceBuild = since?.kind === "sinceBuild" ? since.build : null;
    switch (entry.status) {
      case "blocked":
        return sinceBuild === null
          ? t("performance.details.reasons.blocked")
          : t("performance.details.reasons.blockedSince", {
              build: sinceBuild,
            });
      case "removed": {
        const sectionKey = entry.notes.find(
          (note) => note.kind === "sectionKey",
        );
        if (sectionKey?.kind === "sectionKey") {
          return t("performance.details.reasons.sectionKey", {
            section: sectionKey.section,
          });
        }
        return sinceBuild === null
          ? t("performance.details.reasons.removed")
          : t("performance.details.reasons.removedSince", {
              build: sinceBuild,
            });
      }
      case "notConvar":
        return t("performance.details.reasons.notConvar");
    }
    for (const note of entry.notes) {
      if (note.kind === "denied") return note.reason;
      if (note.kind === "excludedSection") {
        return t("performance.details.reasons.excluded", {
          section: note.section,
        });
      }
      if (note.kind === "missingSection") {
        return t("performance.details.reasons.missingSection", {
          section: note.section,
        });
      }
    }
    return t(`performance.status.${entry.status}`);
  };
};
