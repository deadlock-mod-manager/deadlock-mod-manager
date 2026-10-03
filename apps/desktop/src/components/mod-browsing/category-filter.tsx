import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@deadlock-mods/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { Check } from "@deadlock-mods/ui/icons";
import { CaretDownIcon, TagIcon } from "@phosphor-icons/react";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  getModCategoryDisplayName,
  MOD_CATEGORY_ORDER,
  ModCategory,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toolbarTriggerClass } from "./filters-trigger-button";

type CategoryFilterProps = {
  mods: ModDto[];
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
};

const CategoryFilter = ({
  mods,
  selectedCategories,
  onCategoriesChange,
}: CategoryFilterProps) => {
  const { t } = useTranslation();
  const allCategories = useMemo(() => {
    // Get categories that actually have mods available
    const modsWithCategories = new Set(
      mods.map((mod) => mod.category).filter(Boolean),
    );
    // Use predefined category order, but only show categories that have mods
    const available = MOD_CATEGORY_ORDER.filter((category) =>
      modsWithCategories.has(category),
    );
    // Check if there are any mods with non-predefined categories
    const predefinedCategories = Object.values(ModCategory);
    const hasOtherMods = Array.from(modsWithCategories).some(
      (category) => !predefinedCategories.includes(category as ModCategory),
    );
    // If there are mods with non-predefined categories, add OTHER_MISC to available categories
    return hasOtherMods && !available.includes(ModCategory.OTHER_MISC)
      ? [...available, ModCategory.OTHER_MISC]
      : available;
  }, [mods]);

  const handleCategoryToggle = useCallback(
    (category: string) => {
      const newSelectedCategories = selectedCategories.includes(category)
        ? selectedCategories.filter((c) => c !== category)
        : [...selectedCategories, category];
      onCategoriesChange(newSelectedCategories);
    },
    [selectedCategories, onCategoriesChange],
  );

  const categoryButtonLabel =
    selectedCategories.length === 0
      ? t("filters.allCategories")
      : selectedCategories.length === 1
        ? getModCategoryDisplayName(selectedCategories[0])
        : `${selectedCategories.length} ${t("filters.selected")}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("filters.category")}
          className={cn(
            "max-w-[200px] gap-2 px-3",
            toolbarTriggerClass(selectedCategories.length > 0),
          )}
          variant='outline'>
          <TagIcon className='h-4 w-4 shrink-0' />
          <span className='truncate'>{categoryButtonLabel}</span>
          <CaretDownIcon className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-[240px] p-0'>
        <Command>
          <CommandInput placeholder={t("filters.searchCategories")} />
          <CommandList>
            <CommandEmpty>{t("filters.noCategoriesFound")}</CommandEmpty>
            <CommandGroup>
              {allCategories.map((category) => (
                <CommandItem
                  key={category}
                  onSelect={() => handleCategoryToggle(category)}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 flex-shrink-0",
                      selectedCategories.includes(category)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className='truncate'>
                    {getModCategoryDisplayName(category)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default memo(CategoryFilter);
