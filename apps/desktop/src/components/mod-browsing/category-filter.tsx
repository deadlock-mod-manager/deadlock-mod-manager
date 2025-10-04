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
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { Check } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { MOD_CATEGORY_ORDER, ModCategory } from "@/lib/constants";
import { cn } from "@/lib/utils";

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
  // Get categories that actually have mods available
  const modsWithCategories = new Set(
    mods.map((mod) => mod.category).filter(Boolean),
  );

  // Use predefined category order, but only show categories that have mods
  const availableCategories = MOD_CATEGORY_ORDER.filter((category) =>
    modsWithCategories.has(category),
  );

  // Check if there are any mods with non-predefined categories
  const predefinedCategories = Object.values(ModCategory);
  const hasOtherMods = Array.from(modsWithCategories).some(
    (category) => !predefinedCategories.includes(category as ModCategory),
  );

  // If there are mods with non-predefined categories, add OTHER_MISC to available categories
  const allCategories =
    hasOtherMods && !availableCategories.includes(ModCategory.OTHER_MISC)
      ? [...availableCategories, ModCategory.OTHER_MISC]
      : availableCategories;

  const handleCategoryToggle = (category: string) => {
    const newSelectedCategories = selectedCategories.includes(category)
      ? selectedCategories.filter((c) => c !== category)
      : [...selectedCategories, category];
    onCategoriesChange(newSelectedCategories);
  };

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      <Label className='font-medium text-sm'>{t("filters.category")}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            className='w-[180px] justify-start'
            size='sm'
            variant='outline'>
            <span className='truncate'>
              {selectedCategories.length === 0
                ? t("filters.allCategories")
                : selectedCategories.length === 1
                  ? selectedCategories[0]
                  : `${selectedCategories.length} ${t("filters.selected")}`}
            </span>
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
                    <span className='truncate'>{category}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default CategoryFilter;
