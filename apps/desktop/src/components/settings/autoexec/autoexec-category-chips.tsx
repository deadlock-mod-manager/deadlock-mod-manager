import type { LucideIcon } from "@deadlock-mods/ui/icons";
import { Button } from "@deadlock-mods/ui/components/button";
import { LayoutGrid } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { AutoexecLibraryCategoryFilter } from "@/hooks/use-autoexec-library-filter";
import { AUTOEXEC_CATEGORIES } from "@/lib/autoexec/predefined-commands";
import { cn } from "@/lib/utils";

type AutoexecCategoryChipsProps = {
  selectedCategory: AutoexecLibraryCategoryFilter;
  onCategoryChange: (categoryId: AutoexecLibraryCategoryFilter) => void;
};

export const AutoexecCategoryChips = ({
  selectedCategory,
  onCategoryChange,
}: AutoexecCategoryChipsProps) => {
  const { t } = useTranslation();

  const renderChip = (
    categoryId: AutoexecLibraryCategoryFilter,
    label: string,
    Icon?: LucideIcon,
  ) => {
    const isSelected = selectedCategory === categoryId;

    return (
      <Button
        aria-pressed={isSelected}
        className={cn(
          "shrink-0 gap-1.5",
          isSelected && "border-primary/60 bg-primary/5 text-primary",
        )}
        key={categoryId}
        onClick={() => onCategoryChange(categoryId)}
        size='sm'
        type='button'
        variant='outline'>
        {Icon ? <Icon className='h-3.5 w-3.5' /> : null}
        {label}
      </Button>
    );
  };

  return (
    <div className='-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
      {renderChip("all", t("settings.autoexecCategories.all"), LayoutGrid)}
      {AUTOEXEC_CATEGORIES.map((category) =>
        renderChip(
          category.id,
          t(`settings.autoexecCategories.${category.id}`),
          category.icon,
        ),
      )}
    </div>
  );
};
