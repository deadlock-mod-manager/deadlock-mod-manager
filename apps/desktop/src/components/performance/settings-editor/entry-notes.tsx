import { InfoIcon, WarningIcon } from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { checkRange } from "@/lib/performance/editor/values";
import { cn } from "@/lib/utils";
import type { EntryNote } from "@/types/generated/EntryNote";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";

type NoteLine = { tone: "warning" | "info"; text: string };

type NoteOf<K extends EntryNote["kind"]> = Extract<EntryNote, { kind: K }>;

const findNote = <K extends EntryNote["kind"]>(
  notes: EntryNote[],
  kind: K,
): NoteOf<K> | undefined =>
  notes.find((note): note is NoteOf<K> => note.kind === kind);

const statusLine = (entry: ResolvedEntry, t: TFunction): NoteLine | null => {
  const since = findNote(entry.notes, "sinceBuild")?.build;
  switch (entry.status) {
    case "blocked":
      return {
        tone: "warning",
        text: since
          ? t("performance.editor.notes.blockedSince", { build: since })
          : t("performance.editor.notes.blocked"),
      };
    case "removed": {
      const section = findNote(entry.notes, "sectionKey")?.section;
      return {
        tone: "warning",
        text: section
          ? t("performance.editor.notes.sectionKey", { section })
          : since
            ? t("performance.editor.notes.removedSince", { build: since })
            : t("performance.editor.notes.removed"),
      };
    }
    case "notConvar":
      return { tone: "warning", text: t("performance.editor.notes.notConvar") };
    case "denied": {
      const reason = findNote(entry.notes, "denied")?.reason;
      return {
        tone: "warning",
        text: reason
          ? t("performance.editor.notes.denied", { reason })
          : t("performance.editor.notes.deniedNoReason"),
      };
    }
    case "unsupported": {
      const section = findNote(entry.notes, "missingSection")?.section;
      return {
        tone: "warning",
        text: section
          ? t("performance.editor.notes.missingSection", { section })
          : t("performance.editor.notes.unsupported"),
      };
    }
    case "excluded": {
      const section = findNote(entry.notes, "excludedSection")?.section;
      return {
        tone: "info",
        text: section
          ? t("performance.editor.notes.excludedSection", { section })
          : t("performance.editor.notes.excluded"),
      };
    }
    case "engineSection": {
      const section = findNote(entry.notes, "guardedSection")?.section;
      return {
        tone: "info",
        text: section
          ? t("performance.editor.notes.engineSection", { section })
          : t("performance.editor.notes.engineSectionUnguarded"),
      };
    }
    default:
      return null;
  }
};

const valueLines = (entry: ResolvedEntry, t: TFunction): NoteLine[] => {
  const lines: NoteLine[] = [];
  const value = entry.value ?? "";
  // "You set …" instead of "The config sets …" once the user picked the value.
  const context = entry.overridden ? "yours" : undefined;
  const clamped = findNote(entry.notes, "clamped");
  if (clamped) {
    const range =
      entry.meta === null ? null : checkRange(Number(value), entry.meta);
    const params = { value, effective: clamped.effective, context };
    let text = t("performance.editor.notes.clamped", params);
    if (range && !range.within) {
      text = t(
        range.bound === "min"
          ? "performance.editor.notes.clampedBelow"
          : "performance.editor.notes.clampedAbove",
        { ...params, limit: range.limit },
      );
    }
    lines.push({ tone: "warning", text });
  }
  const mismatch = findNote(entry.notes, "typeMismatch");
  if (mismatch) {
    lines.push({
      tone: "warning",
      text: t("performance.editor.notes.typeMismatch", {
        value,
        context,
        expected: t(`performance.editor.notes.expected.${mismatch.expected}`),
      }),
    });
  }
  return lines;
};

/** One factual line per reason the entry won't apply exactly as written. */
export const EntryNotes = ({ entry }: { entry: ResolvedEntry }) => {
  const { t } = useTranslation();
  const status = statusLine(entry, t);
  const lines = status
    ? [status, ...valueLines(entry, t)]
    : valueLines(entry, t);
  if (lines.length === 0) return null;

  return (
    <ul className='space-y-0.5'>
      {lines.map(({ tone, text }) => {
        const Icon = tone === "warning" ? WarningIcon : InfoIcon;
        return (
          <li
            className={cn(
              "flex items-start gap-1.5 text-xs leading-relaxed",
              tone === "warning" ? "text-amber-400" : "text-muted-foreground",
            )}
            key={text}>
            <Icon className='mt-0.5 size-3.5 shrink-0' />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
};
