import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingContentMatch } from "@/types/generated/ModdingContentMatch";
import { ContentMatchText } from "./content-match-text";

export function DocumentTextView({
  text,
  match,
}: {
  text: string;
  match?: ModdingContentMatch;
}) {
  const { t } = useTranslation();
  const lines = useMemo(() => text.split(/\r?\n/), [text]);
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 24,
    overscan: 8,
  });
  useEffect(() => {
    if (match)
      rows.scrollToIndex(Math.max(0, match.line - 1), { align: "center" });
  }, [text, match?.line, rows]);
  return (
    <div
      ref={scroll}
      role='region'
      aria-label={t("workbenchExplorer.documentContents")}
      className='min-h-0 flex-1 overflow-auto'>
      <div
        className='relative min-w-full'
        style={{ height: rows.getTotalSize() }}>
        {rows.getVirtualItems().map((row) => (
          <div
            key={row.index}
            className={`absolute left-0 flex h-6 min-w-full items-center gap-3 whitespace-pre px-3 font-mono text-[11px] ${row.index + 1 === match?.line ? "bg-accent" : ""}`}
            style={{ transform: `translateY(${row.start}px)` }}>
            <span
              className='w-10 shrink-0 select-none text-right tabular-nums text-muted-foreground'
              aria-hidden='true'>
              {row.index + 1}
            </span>
            <span>
              {match && row.index + 1 === match.line ? (
                <ContentMatchText
                  text={lines[row.index] ?? ""}
                  start={match.column}
                  end={match.endColumn}
                />
              ) : (
                lines[row.index]
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
