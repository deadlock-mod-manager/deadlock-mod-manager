import { Button } from "@deadlock-mods/ui/components/button";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { DraftAction } from "@/lib/performance/editor/draft";
import type { CategoryGroup } from "@/lib/performance/editor/filter";
import { pathKey } from "@/lib/performance/request";
import { cn } from "@/lib/utils";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import { categoryLabel } from "./category-rail";
import { ENTRY_ROW_GRID, EntryRow } from "./entry-row";

/** Rows shown per category before "Show N more"; keeps 500-entry configs cheap to render. */
const COLLAPSED_ROW_LIMIT = 12;

type EntryGroupProps = {
  group: CategoryGroup;
  expanded: boolean;
  onToggleExpanded: (id: string) => void;
  overrides: ReadonlyMap<string, EntryOverride>;
  showKeys: boolean;
  engineIncluded: boolean;
  highlightKey: string | null;
  onAction: (action: DraftAction) => void;
  registerElement: (id: string, element: HTMLElement | null) => void;
};

export const EntryGroup = ({
  group,
  expanded,
  onToggleExpanded,
  overrides,
  showKeys,
  engineIncluded,
  highlightKey,
  onAction,
  registerElement,
}: EntryGroupProps) => {
  const { t } = useTranslation();
  const label = categoryLabel(t, group);
  const hidden = group.entries.length - COLLAPSED_ROW_LIMIT;
  const rows = expanded
    ? group.entries
    : group.entries.slice(0, COLLAPSED_ROW_LIMIT);

  return (
    <section
      className='scroll-mt-16 overflow-hidden rounded-lg border border-border/50 bg-card/50 [contain-intrinsic-size:auto_640px] [content-visibility:auto]'
      data-category={group.id}
      ref={(element) => registerElement(group.id, element)}>
      <header
        className={cn(
          ENTRY_ROW_GRID,
          "items-baseline border-border/50 border-b bg-muted/20 px-4 py-2.5",
        )}>
        <div className='flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5'>
          <h3 className='font-semibold text-sm'>{label}</h3>
          <span className='font-mono text-muted-foreground text-xs'>
            {[
              t("performance.editor.group.settings", { count: group.total }),
              group.changed > 0 &&
                t("performance.editor.group.changed", { count: group.changed }),
              group.attention > 0 &&
                t("performance.editor.group.attention", {
                  count: group.attention,
                }),
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
        </div>
        <span className='font-medium text-muted-foreground text-xs'>
          {t("performance.editor.group.value")}
        </span>
        <span className='col-span-2 font-medium text-muted-foreground text-xs'>
          {t("performance.editor.group.reference")}
        </span>
      </header>
      <div>
        {rows.map((entry) => {
          const key = pathKey(entry.path);
          return (
            <EntryRow
              engineIncluded={engineIncluded}
              entry={entry}
              entryKey={key}
              highlighted={highlightKey === key}
              key={key}
              onAction={onAction}
              override={overrides.get(key)}
              showKey={showKeys}
            />
          );
        })}
      </div>
      {hidden > 0 && (
        <div className='flex justify-center border-border/40 border-t py-1.5'>
          <Button
            onClick={() => onToggleExpanded(group.id)}
            size='sm'
            variant='ghost'>
            {expanded ? (
              <>
                <CaretUpIcon />
                {t("performance.editor.group.showFewer")}
              </>
            ) : (
              <>
                <CaretDownIcon />
                {t("performance.editor.group.showMore", {
                  count: hidden,
                  category: label,
                })}
              </>
            )}
          </Button>
        </div>
      )}
    </section>
  );
};
