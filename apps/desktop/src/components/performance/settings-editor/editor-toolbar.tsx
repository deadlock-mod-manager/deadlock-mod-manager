import { Label } from "@deadlock-mods/ui/components/label";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { Switch } from "@deadlock-mods/ui/components/switch";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  EditorFilter,
  FilterCounts,
} from "@/lib/performance/editor/filter";
import { FilterTabs } from "@/components/performance/filter-tabs";

type EditorToolbarProps = {
  search: string;
  onSearchChange: (search: string) => void;
  filter: EditorFilter;
  onFilterChange: (filter: EditorFilter) => void;
  counts: FilterCounts;
  showKeys: boolean;
  onShowKeysChange: (show: boolean) => void;
  addSetting: ReactNode;
};

export const EditorToolbar = ({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  counts,
  showKeys,
  onShowKeysChange,
  addSetting,
}: EditorToolbarProps) => {
  const { t } = useTranslation();
  const tabs = [
    { value: "all", label: t("performance.editor.toolbar.filterAll") },
    {
      value: "changed",
      label: t("performance.editor.toolbar.filterChanged"),
      count: counts.changed,
    },
    {
      value: "attention",
      label: t("performance.editor.toolbar.filterAttention"),
      count: counts.attention,
    },
  ] satisfies { value: EditorFilter; label: string; count?: number }[];

  return (
    <div className='sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 bg-background/95 px-1 py-2.5 backdrop-blur-sm'>
      <div className='w-72 min-w-48'>
        <SearchInput
          className='h-8'
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("performance.editor.toolbar.search", {
            count: counts.all,
          })}
          value={search}
        />
      </div>
      <FilterTabs onValueChange={onFilterChange} tabs={tabs} value={filter} />
      <div className='ml-auto flex items-center gap-4'>
        <div className='flex items-center gap-2'>
          <Switch
            checked={showKeys}
            id='perf-editor-convar-names'
            onCheckedChange={onShowKeysChange}
          />
          <Label
            className='font-normal text-muted-foreground text-sm'
            htmlFor='perf-editor-convar-names'>
            {t("performance.editor.toolbar.convarNames")}
          </Label>
        </div>
        {addSetting}
      </div>
    </div>
  );
};
