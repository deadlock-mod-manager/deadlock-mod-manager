import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { CategoryGroup } from "@/lib/performance/editor/filter";
import { cn } from "@/lib/utils";

type CategoryRailProps = {
  groups: CategoryGroup[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export const categoryLabel = (
  t: TFunction,
  group: Pick<CategoryGroup, "id" | "label">,
) => t(`performance.categories.${group.id}`, { defaultValue: group.label });

export const CategoryRail = ({
  groups,
  activeId,
  onSelect,
}: CategoryRailProps) => {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("performance.editor.rail.label")}
      className='sticky top-16 self-start'>
      <ul className='flex flex-col gap-0.5'>
        {groups.map((group) => {
          const empty = group.entries.length === 0;
          return (
            <li key={group.id}>
              <button
                aria-current={activeId === group.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                  "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
                  activeId === group.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground",
                )}
                disabled={empty}
                onClick={() => onSelect(group.id)}
                type='button'>
                <span className='min-w-0 flex-1 truncate'>
                  {categoryLabel(t, group)}
                </span>
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {group.entries.length}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
