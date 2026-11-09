import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@deadlock-mods/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  TagIcon,
} from "@phosphor-icons/react";
import { memo, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MOD_CATEGORY_ORDER, ModCategory } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toolbarTriggerClass } from "./filters-trigger-button";
import {
  broadCategoryLabel,
  buildCategoryTree,
  catalogCategoryLabel,
  type CatalogCategorySelection,
  type CategorySelection,
  flattenCategoryTree,
  rootCategoryName,
  selectedCategoryLabel,
} from "./catalog-categories";
import {
  heroCategoryForKey,
  toggleCatalogFilterCategory,
} from "./catalog-hero-categories";
import { CategoryFilterItem } from "./category-filter-item";
import { CategoryFilterBreadcrumbs } from "./category-filter-breadcrumbs";

type CategoryFilterProps = {
  mods: Array<Pick<ModDto, "category">>;
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  catalogCategories?: CatalogCategorySelection;
};

const CategoryFilter = ({
  mods,
  selectedCategories,
  onCategoriesChange,
  catalogCategories,
}: CategoryFilterProps) => {
  const { t } = useTranslation();
  const isCatalog = catalogCategories !== undefined;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [browsingKey, setBrowsingKey] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const options = useMemo(
    () =>
      flattenCategoryTree(buildCategoryTree(catalogCategories?.paths ?? [])),
    [catalogCategories?.paths],
  );
  const current = options.find(({ node }) => node.category.key === browsingKey);
  const allCategories = useMemo(() => {
    const available = new Set(mods.map((mod) => mod.category).filter(Boolean));
    const ordered = MOD_CATEGORY_ORDER.filter((category) =>
      available.has(category),
    );
    const predefined: string[] = Object.values(ModCategory);
    if (isCatalog)
      return [
        ...ordered,
        ...[...available].filter((category) => !predefined.includes(category)),
      ];
    return [...available].some((category) => !predefined.includes(category)) &&
      !ordered.includes(ModCategory.OTHER_MISC)
      ? [...ordered, ModCategory.OTHER_MISC]
      : ordered;
  }, [mods, isCatalog]);
  const selectedKeys = catalogCategories?.selectedKeys ?? [];
  const visibleKeys = selectedKeys.filter(
    (key) =>
      heroCategoryForKey(key, catalogCategories?.paths ?? [])?.category.key !==
      key,
  );
  const selectionCount = selectedCategories.length + visibleKeys.length;
  const categoryButtonLabel =
    selectionCount === 0
      ? t("filters.allCategories")
      : selectionCount === 1
        ? selectedCategories.length === 1
          ? broadCategoryLabel(selectedCategories[0], !!catalogCategories, t)
          : selectedCategoryLabel(
              visibleKeys[0],
              catalogCategories?.paths ?? [],
              t,
            )
        : t("filters.categoriesSelected", { count: selectionCount });
  const query = search.trim().toLocaleLowerCase();
  const visibleBroadCategories =
    current && !query
      ? []
      : allCategories.filter(
          (category) =>
            !options.some(
              (option) =>
                option.path.length === 1 &&
                option.node.category.name === category,
            ) &&
            `${broadCategoryLabel(category, !!catalogCategories, t)} ${category}`
              .toLocaleLowerCase()
              .includes(query),
        );
  const visibleOptions = options.filter(({ node, path }) =>
    query
      ? path.some((category) =>
          `${catalogCategoryLabel(category, t)} ${category.name}`
            .toLocaleLowerCase()
            .includes(query),
        )
      : current
        ? current.node.children.includes(node)
        : path.length === 1,
  );
  const applySelection = (selection: CategorySelection) => {
    if (catalogCategories)
      catalogCategories.onSelectionChange({
        ...selection,
        heroes: catalogCategories.selectedHeroes,
      });
    else onCategoriesChange(selection.categories);
  };
  const navigate = (key: string | null) => {
    setBrowsingKey(key);
    setSearch("");
    searchInput.current?.focus();
  };
  const toggle = (key: string) =>
    catalogCategories?.onSelectionChange(
      toggleCatalogFilterCategory(
        key,
        {
          categories: selectedCategories,
          keys: selectedKeys,
          heroes: catalogCategories.selectedHeroes,
        },
        catalogCategories.paths,
      ),
    );
  const isChecked = (key: string) => {
    if (selectedKeys.includes(key)) return true;
    const linked = heroCategoryForKey(key, catalogCategories?.paths ?? []);
    if (linked && linked.category.key === key)
      return (
        selectedCategories.includes(linked.root.name) &&
        !!catalogCategories?.selectedHeroes.includes(linked.hero)
      );
    const category = rootCategoryName(key, catalogCategories?.paths ?? []);
    return category !== undefined && selectedCategories.includes(category);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("filters.category")}
          className={cn(
            "max-w-[220px] gap-2 px-3",
            toolbarTriggerClass(selectionCount > 0),
          )}
          variant='outline'>
          <TagIcon className='h-4 w-4 shrink-0' />
          <span className='truncate'>{categoryButtonLabel}</span>
          <CaretDownIcon className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden p-0'
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInput.current?.focus();
        }}>
        {current && !query ? (
          <CategoryFilterBreadcrumbs
            path={current.path}
            onNavigate={navigate}
          />
        ) : null}
        <Command shouldFilter={false} label={t("filters.category")}>
          <CommandInput
            ref={searchInput}
            aria-label={t("filters.searchCategories")}
            onValueChange={setSearch}
            placeholder={t("filters.searchCategories")}
            value={search}
          />
          <CommandList
            className='max-h-[340px]'
            key={query ? "search" : (browsingKey ?? "root")}>
            <CommandEmpty>{t("filters.noCategoriesFound")}</CommandEmpty>
            {current && !query ? (
              <CommandGroup className='border-b p-1.5'>
                <CategoryFilterItem
                  kind='select'
                  checked={isChecked(current.node.category.key)}
                  description={t("filters.includesSubcategories")}
                  label={t("filters.allInCategory", {
                    name: catalogCategoryLabel(current.node.category, t),
                  })}
                  value={current.node.category.key}
                  onSelect={() => toggle(current.node.category.key)}
                />
              </CommandGroup>
            ) : null}
            <CommandGroup
              className='p-1.5'
              heading={
                query
                  ? t("filters.categorySearchResults")
                  : current
                    ? t("filters.subcategories")
                    : undefined
              }>
              {visibleBroadCategories.map((category) => (
                <CategoryFilterItem
                  key={category}
                  kind='select'
                  checked={selectedCategories.includes(category)}
                  label={broadCategoryLabel(category, !!catalogCategories, t)}
                  value={category}
                  onSelect={() =>
                    applySelection({
                      categories: selectedCategories.includes(category)
                        ? selectedCategories.filter(
                            (entry) => entry !== category,
                          )
                        : [...selectedCategories, category],
                      keys: selectedKeys,
                    })
                  }
                />
              ))}
              {visibleOptions.map(({ node, path }) => {
                const label = catalogCategoryLabel(node.category, t);
                const selectedCount = isChecked(node.category.key)
                  ? 1
                  : options.filter(
                      (option) =>
                        option.path.some(
                          (category) => category.key === node.category.key,
                        ) && selectedKeys.includes(option.node.category.key),
                    ).length;
                return !query && node.children.length > 0 ? (
                  <CategoryFilterItem
                    key={node.category.key}
                    kind='browse'
                    label={label}
                    value={`browse:${node.category.key}`}
                    selectedCount={selectedCount}
                    onSelect={() => navigate(node.category.key)}
                  />
                ) : (
                  <CategoryFilterItem
                    key={node.category.key}
                    kind='select'
                    checked={isChecked(node.category.key)}
                    description={
                      query
                        ? path
                            .slice(0, -1)
                            .map((category) =>
                              catalogCategoryLabel(category, t),
                            )
                            .join(" / ")
                        : undefined
                    }
                    label={
                      node.children.length > 0
                        ? t("filters.allInCategory", { name: label })
                        : label
                    }
                    value={node.category.key}
                    onSelect={() => toggle(node.category.key)}
                  />
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className='border-t bg-muted/20 px-3 py-2 text-muted-foreground text-xs'>
          {t(
            current &&
              heroCategoryForKey(
                current.node.category.key,
                catalogCategories?.paths ?? [],
              )
              ? "filters.heroCategorySelectionHint"
              : options.some(({ node }) => node.children.length > 0)
                ? "filters.categorySelectionHint"
                : "filters.categoryMultiSelectHint",
          )}
        </div>
        <div className='flex items-center justify-between border-t px-2 py-1.5'>
          <Button
            disabled={selectionCount === 0}
            icon={<ArrowCounterClockwiseIcon aria-hidden />}
            onClick={() => applySelection({ categories: [], keys: [] })}
            size='sm'
            variant='ghost'>
            {t("filters.clearCategories")}
          </Button>
          <Button
            icon={<CheckIcon aria-hidden />}
            onClick={() => setOpen(false)}
            size='sm'
            variant='secondary'>
            {t("filters.doneCategories")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default memo(CategoryFilter);
