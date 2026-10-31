import { entryDisplayName } from "@/lib/performance/import/review";
import type { IgnoredKind } from "@/types/generated/IgnoredKind";
import type { IgnoredPart } from "@/types/generated/IgnoredPart";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { useTranslation } from "react-i18next";

const IGNORED_ORDER: IgnoredKind[] = [
  "searchPaths",
  "modManagerMarkers",
  "listSection",
  "rootKey",
  "editorSection",
  "machineSpecific",
  "bind",
  "alias",
  "exec",
  "consoleCommand",
  "duplicateKey",
  "parseError",
];

export const IgnoredParts = ({
  ignored,
  excluded,
}: {
  ignored: IgnoredPart[];
  excluded: ResolvedEntry[];
}) => {
  const { t } = useTranslation();
  const byKind = IGNORED_ORDER.map((kind) => ({
    kind,
    parts: ignored.filter((part) => part.kind === kind),
  })).filter((group) => group.parts.length > 0);

  return (
    <ul className='divide-y divide-border/60 text-xs'>
      {byKind.map(({ kind, parts }) => (
        <li className='px-3 py-2' key={kind}>
          <div className='flex items-baseline justify-between gap-4'>
            <span className='font-medium'>
              {t(`performance.import.review.ignored.kinds.${kind}`)}
            </span>
            <span className='font-mono text-muted-foreground tabular-nums'>
              {parts.length}
            </span>
          </div>
          <p className='mt-1 break-words font-mono text-muted-foreground'>
            {parts
              .map((part) =>
                part.line === null
                  ? part.detail
                  : t("performance.import.review.ignored.atLine", {
                      detail: part.detail,
                      line: part.line,
                    }),
              )
              .join(", ")}
          </p>
        </li>
      ))}
      {excluded.length > 0 && (
        <li className='px-3 py-2'>
          <div className='flex items-baseline justify-between gap-4'>
            <span className='font-medium'>
              {t("performance.import.review.ignored.neverWritten")}
            </span>
            <span className='font-mono text-muted-foreground tabular-nums'>
              {excluded.length}
            </span>
          </div>
          <p className='mt-1 break-words font-mono text-muted-foreground'>
            {excluded.map((entry) => entryDisplayName(entry.path)).join(", ")}
          </p>
        </li>
      )}
    </ul>
  );
};
