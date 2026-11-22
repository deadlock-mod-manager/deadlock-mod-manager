import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { entryDisplayName } from "@/lib/performance/import/review";
import { cn } from "@/lib/utils";
import type { EntryNote } from "@/types/generated/EntryNote";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";

type ReviewSectionProps = {
  icon: ReactNode;
  title: string;
  count: number;
  /** Always visible under the header, also while collapsed. */
  summary?: ReactNode;
  /** Controls in the header, such as an Include switch. */
  action?: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
};

export const ReviewSection = ({
  icon,
  title,
  count,
  summary,
  action,
  defaultOpen = false,
  children,
}: ReviewSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = children !== undefined;

  return (
    <Collapsible
      className='rounded-md border bg-card/40'
      onOpenChange={setOpen}
      open={expandable && open}>
      <div className='flex items-center gap-3 px-3 py-2'>
        <CollapsibleTrigger
          className='flex min-w-0 flex-1 items-center gap-2 text-left font-medium text-sm disabled:cursor-default'
          disabled={!expandable}>
          <CaretRightIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
              !expandable && "invisible",
            )}
          />
          {icon}
          <span className='truncate'>{title}</span>
        </CollapsibleTrigger>
        {action}
        <span className='font-mono text-muted-foreground text-xs tabular-nums'>
          {count}
        </span>
      </div>
      {summary && (
        <div className='px-3 pb-2.5 pl-[2.375rem] text-muted-foreground text-xs leading-relaxed'>
          {summary}
        </div>
      )}
      {expandable && (
        <CollapsibleContent className='border-t'>{children}</CollapsibleContent>
      )}
    </Collapsible>
  );
};

const noteText = (note: EntryNote, t: TFunction) => {
  switch (note.kind) {
    case "clamped":
      return t("performance.import.review.notes.clamped", {
        value: note.effective,
      });
    case "typeMismatch":
      return t("performance.import.review.notes.typeMismatch", {
        kind: note.expected,
      });
    case "denied":
      return note.reason;
    case "excludedSection":
    case "guardedSection":
      return note.section;
    case "missingSection":
      return t("performance.import.review.notes.missingSection", {
        section: note.section,
      });
    case "sinceBuild":
      return t("performance.import.review.notes.sinceBuild", {
        build: note.build,
      });
    case "sectionKey":
      return t("performance.import.review.notes.sectionKey", {
        section: note.section,
      });
  }
};

export const EntryReason = ({ entry }: { entry: ResolvedEntry }) => {
  const { t } = useTranslation();
  const parts = [
    t(`performance.status.${entry.status}`),
    ...entry.notes.map((note) => noteText(note, t)),
  ];
  return (
    <span className='shrink-0 text-right text-muted-foreground'>
      {parts.join(", ")}
    </span>
  );
};

export const EntryValue = ({ entry }: { entry: ResolvedEntry }) => {
  const { t } = useTranslation();
  const reference =
    entry.meta?.default != null
      ? t("performance.import.review.defaultValue", {
          value: entry.meta.default,
        })
      : entry.liveValue != null
        ? t("performance.import.review.liveValue", { value: entry.liveValue })
        : null;
  return (
    <span className='flex shrink-0 items-baseline gap-2 font-mono'>
      <span>{entry.value ?? t("performance.import.review.commentedOut")}</span>
      {reference && <span className='text-muted-foreground'>{reference}</span>}
    </span>
  );
};

type EntryListProps = {
  entries: ResolvedEntry[];
  /** Rows shown before "Show N more". */
  limit?: number;
  renderDetail?: (entry: ResolvedEntry) => ReactNode;
  footer?: ReactNode;
};

export const EntryList = ({
  entries,
  limit = entries.length,
  renderDetail = (entry) => <EntryValue entry={entry} />,
  footer,
}: EntryListProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, limit);
  const hidden = entries.length - visible.length;

  return (
    <div className='text-xs'>
      <ul className='divide-y divide-border/60'>
        {visible.map((entry) => (
          <li
            className='flex items-baseline justify-between gap-4 px-3 py-1.5'
            key={entry.path.join("\u0000")}>
            <span
              className='min-w-0 truncate font-mono'
              title={entry.meta?.label ?? entry.meta?.help ?? undefined}>
              {entryDisplayName(entry.path)}
            </span>
            {renderDetail(entry)}
          </li>
        ))}
      </ul>
      {(hidden > 0 || footer) && (
        <div className='flex flex-wrap items-center gap-x-2 border-t px-3 py-2 text-muted-foreground'>
          {hidden > 0 && (
            <button
              className='font-medium text-primary hover:underline'
              onClick={() => setExpanded(true)}
              type='button'>
              {t("performance.import.review.showMore", { count: hidden })}
            </button>
          )}
          {footer}
        </div>
      )}
    </div>
  );
};
