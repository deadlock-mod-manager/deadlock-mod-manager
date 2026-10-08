import { type ClipboardEvent, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  highlightConfig,
  type LineTone,
} from "@/lib/performance/import/highlight";
import { cn } from "@/lib/utils";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";

const TONE_CLASS = {
  applies: "text-foreground",
  ignored: "text-amber-400",
  stripped: "text-red-400",
  optIn: "text-sky-400",
  skipped: "text-muted-foreground",
  plain: "text-foreground/70",
} satisfies Record<LineTone, string>;

const LEGEND = [
  { tone: "applies", dot: "bg-foreground" },
  { tone: "ignored", dot: "bg-amber-400" },
  { tone: "stripped", dot: "bg-red-400" },
  { tone: "optIn", dot: "bg-sky-400" },
] as const;

// Both layers must share these so the colored text sits under the caret.
const LAYER_CLASS =
  "absolute inset-0 m-0 whitespace-pre rounded-md border px-3 py-2 font-mono text-xs leading-relaxed";

const ToneLegend = () => {
  const { t } = useTranslation();
  return (
    <ul className='flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs'>
      {LEGEND.map(({ tone, dot }) => (
        <li className='flex items-center gap-1.5' key={tone}>
          <span className={cn("size-1.5 rounded-full", dot)} />
          {t(`performance.import.paste.legend.${tone}`)}
        </li>
      ))}
    </ul>
  );
};

/**
 * Textarea that colors each line by what the import review says happens to
 * it, drawn underneath transparent text.
 */
export const ConfigTextArea = ({
  value,
  entries,
  onChange,
  onPaste,
  placeholder,
  label,
  className,
}: {
  value: string;
  /** The review's resolved entries; `null` before the text is reviewed. */
  entries: ResolvedEntry[] | null;
  onChange: (value: string) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  label: string;
  className?: string;
}) => {
  const highlightRef = useRef<HTMLPreElement>(null);
  const lines = useMemo(
    () => highlightConfig(value, entries),
    [value, entries],
  );
  // Config lines must not wrap, but the placeholder should; the highlight
  // layer is empty then, so there is nothing to keep aligned.
  const isEmpty = value.length === 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className='relative min-h-0 flex-1'>
        <pre
          aria-hidden
          className={cn(
            LAYER_CLASS,
            "pointer-events-none overflow-hidden border-transparent",
          )}
          ref={highlightRef}>
          {lines.map(({ line, tone, tokens }) => (
            <div className={TONE_CLASS[tone]} key={line}>
              {tokens.map((token) => (
                <span
                  className={cn(
                    token.kind === "comment" && "text-muted-foreground",
                  )}
                  key={token.start}>
                  {token.text}
                </span>
              ))}
              {tokens.length === 0 && "\n"}
            </div>
          ))}
        </pre>
        <textarea
          aria-label={label}
          className={cn(
            LAYER_CLASS,
            isEmpty && "whitespace-pre-wrap",
            "resize-none overflow-auto border-input bg-transparent text-transparent caret-foreground shadow-sm selection:bg-primary/30 selection:text-transparent placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
          onChange={(event) => onChange(event.target.value)}
          onPaste={onPaste}
          onScroll={(event) => {
            const highlight = highlightRef.current;
            if (!highlight) return;
            highlight.scrollTop = event.currentTarget.scrollTop;
            highlight.scrollLeft = event.currentTarget.scrollLeft;
          }}
          placeholder={placeholder}
          spellCheck={false}
          value={value}
          wrap={isEmpty ? "soft" : "off"}
        />
      </div>
      {entries && !isEmpty && <ToneLegend />}
    </div>
  );
};
