import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { CatalogCategory } from "@/types/generated/CatalogCategory";
import { catalogCategoryLabel } from "./catalog-categories";

interface CategoryFilterBreadcrumbsProps {
  path: CatalogCategory[];
  onNavigate: (key: string | null) => void;
}

export const CategoryFilterBreadcrumbs = ({
  path,
  onNavigate,
}: CategoryFilterBreadcrumbsProps) => {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("filters.categoryPath")}
      className='flex min-h-11 items-center gap-1 border-b px-2 py-1.5 text-xs'>
      <Button
        aria-label={t("filters.backToCategories")}
        className='size-7 shrink-0'
        onClick={() => onNavigate(path.at(-2)?.key ?? null)}
        size='icon'
        variant='ghost'>
        <ArrowLeftIcon className='size-3.5' />
      </Button>
      <button
        className='rounded px-1 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-ring'
        onClick={() => onNavigate(null)}
        type='button'>
        {t("filters.category")}
      </button>
      {path.map((category, index) => (
        <span className='flex min-w-0 items-center gap-1' key={category.key}>
          <CaretRightIcon
            aria-hidden='true'
            className='size-3 shrink-0 text-muted-foreground'
          />
          {index === path.length - 1 ? (
            <span aria-current='location' className='truncate font-medium'>
              {catalogCategoryLabel(category, t)}
            </span>
          ) : (
            <button
              className='truncate rounded px-1 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-ring'
              onClick={() => onNavigate(category.key)}
              type='button'>
              {catalogCategoryLabel(category, t)}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
};
