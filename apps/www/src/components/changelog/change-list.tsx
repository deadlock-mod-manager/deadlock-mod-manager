import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowUpIcon,
  BugIcon,
  type Icon,
  SparkleIcon,
} from "@phosphor-icons/react";
import type { Change, ChangeKind } from "@/lib/changelog";

export const KINDS: {
  kind: ChangeKind;
  label: string;
  icon: Icon;
  /** Text and bar colour for the kind. */
  tone: string;
  bar: string;
}[] = [
  {
    kind: "new",
    label: "New",
    icon: SparkleIcon,
    tone: "text-primary",
    bar: "bg-primary",
  },
  {
    kind: "improved",
    label: "Improved",
    icon: ArrowUpIcon,
    tone: "text-sky-300",
    bar: "bg-sky-400",
  },
  {
    kind: "fixed",
    label: "Fixed",
    icon: BugIcon,
    tone: "text-online",
    bar: "bg-online",
  },
];

/** Entries shown per group before the rest fold under "Show more". */
const VISIBLE_CHANGES = 6;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wraps every occurrence of the (lowercase) search query in <mark>. */
const Highlight = ({ text, query }: { text: string; query: string }) => {
  if (!query) return text;
  let offset = 0;
  return text.split(new RegExp(`(${escapeRegExp(query)})`, "i")).map((part) => {
    const start = offset;
    offset += part.length;
    return part.toLowerCase() === query ? (
      <mark
        key={start}
        className='rounded-sm bg-primary/25 px-0.5 text-foreground'>
        {part}
      </mark>
    ) : (
      part
    );
  });
};

/**
 * Changesets only use `code` for inline markup. Parts are keyed by where they
 * start in the text, which stays unique even when a code span repeats.
 */
const Inline = ({ text, query }: { text: string; query: string }) =>
  [...text.matchAll(/`[^`]+`|[^`]+|`/g)].map(({ 0: part, index }) =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={index}>
        <Highlight text={part.slice(1, -1)} query={query} />
      </code>
    ) : (
      <Highlight key={index} text={part} query={query} />
    ),
  );

const ChangeItem = ({ change, query }: { change: Change; query: string }) => {
  const bullets = change.details.filter((line) => line.startsWith("- "));
  const paragraphs = change.details.filter((line) => !line.startsWith("- "));

  return (
    <li className='py-1.5'>
      <Inline text={change.summary} query={query} />
      {paragraphs.map((line) => (
        <p key={line} className='mt-1.5 text-[14px] text-muted-foreground'>
          <Inline text={line} query={query} />
        </p>
      ))}
      {bullets.length > 0 && (
        <ul className='mt-1.5 list-disc space-y-1 pl-5 text-[14px] text-muted-foreground'>
          {bullets.map((line) => (
            <li key={line}>
              <Inline text={line.slice(2)} query={query} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

const changeListClassName =
  "text-[15px] text-foreground-soft leading-relaxed [&_code]:rounded [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:text-foreground";

export const ChangeGroup = ({
  kind,
  changes,
  query,
}: {
  kind: ChangeKind;
  changes: Change[];
  query: string;
}) => {
  const {
    label,
    icon: KindIcon,
    tone,
  } = KINDS.find((entry) => entry.kind === kind) ?? KINDS[0];
  // Search results are short and the point is to see them all.
  const visible = query ? changes : changes.slice(0, VISIBLE_CHANGES);
  const folded = query ? [] : changes.slice(VISIBLE_CHANGES);

  return (
    <div>
      <h3 className='flex items-center gap-2 font-semibold text-sm'>
        <KindIcon
          aria-hidden='true'
          weight='bold'
          className={cn("size-4", tone)}
        />
        {label}
        <span className='font-normal text-muted-foreground tabular-nums'>
          {changes.length}
        </span>
      </h3>
      <ul className={cn("mt-2", changeListClassName)}>
        {visible.map((change) => (
          <ChangeItem key={change.summary} change={change} query={query} />
        ))}
      </ul>
      {folded.length > 0 && (
        <details className='group'>
          <summary className='mt-1 inline-flex cursor-pointer list-none items-center gap-1.5 rounded font-medium text-primary text-sm hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 group-open:hidden [&::-webkit-details-marker]:hidden'>
            Show {folded.length} more
          </summary>
          <ul className={changeListClassName}>
            {folded.map((change) => (
              <ChangeItem key={change.summary} change={change} query={query} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

/** The release's mix of new, improved and fixed entries as one thin bar. */
export const CompositionBar = ({ changes }: { changes: Change[] }) => {
  const counts = KINDS.map(({ kind, label, bar }) => ({
    kind,
    label,
    bar,
    count: changes.filter((change) => change.kind === kind).length,
  }));

  return (
    <div
      role='img'
      aria-label={counts
        .map((entry) => `${entry.count} ${entry.label.toLowerCase()}`)
        .join(", ")}
      className='flex h-1.5 w-full max-w-40 gap-0.5 overflow-hidden rounded-full'>
      {counts
        .filter((entry) => entry.count > 0)
        .map((entry) => (
          <span
            key={entry.kind}
            className={entry.bar}
            style={{ flexGrow: entry.count }}
          />
        ))}
    </div>
  );
};
