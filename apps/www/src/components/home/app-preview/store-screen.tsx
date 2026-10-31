import { cn } from "@deadlock-mods/ui/lib/utils";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fieldClassName } from "./mod-field-styles";
import { CATEGORY_KEYS, PREVIEW_MODS } from "./mods";
import { EmptyState, ModCard, PageTitle } from "./parts";
import { CONTENT_TABS, heroes } from "./store-filters";

export const StoreScreen = () => {
  const { t } = useTranslation("preview");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [hero, setHero] = useState("all");
  const [sort, setSort] = useState("default");

  const mods = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = PREVIEW_MODS.filter(
      (mod) =>
        (category === "all" || mod.category === category) &&
        (hero === "all" || mod.hero === hero) &&
        (!needle ||
          mod.name.toLowerCase().includes(needle) ||
          mod.author.toLowerCase().includes(needle)),
    );
    if (sort === "downloads") {
      return [...filtered].sort((a, b) => b.downloads - a.downloads);
    }
    if (sort === "rating") {
      return [...filtered].sort((a, b) => b.likes - a.likes);
    }
    if (sort === "updated") {
      return [...filtered].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
    }
    return filtered;
  }, [query, category, hero, sort]);

  return (
    <div className='flex flex-col px-4'>
      <div className='mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-border/60 border-b'>
        <PageTitle
          className='pb-3'
          title={t("store.title")}
          subtitle={t("store.subtitle")}
        />
        <div className='-mb-px flex gap-1'>
          {CONTENT_TABS.map((tab, index) => (
            <span
              key={tab.id}
              className={cn(
                "relative flex h-9 items-center gap-2 rounded-md px-3 text-sm after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                index === 0
                  ? "text-foreground after:opacity-100"
                  : "text-muted-foreground after:opacity-0",
              )}>
              <tab.icon
                weight='duotone'
                className={cn("size-4", index === 0 && "text-primary")}
              />
              {t(`store.tabs.${tab.id}`)}
            </span>
          ))}
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <label className='relative min-w-48 max-w-sm flex-1'>
          <span className='sr-only'>{t("store.searchLabel")}</span>
          <MagnifyingGlassIcon className='-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground' />
          <input
            type='search'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("store.searchPlaceholder")}
            className={cn(
              fieldClassName,
              "w-full pl-9 text-foreground placeholder:text-muted-foreground",
            )}
          />
        </label>
        <select
          aria-label={t("store.heroLabel")}
          value={hero}
          onChange={(event) => setHero(event.target.value)}
          className={fieldClassName}>
          <option value='all'>{t("store.allHeroes")}</option>
          {heroes.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={t("store.categoryLabel")}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className={fieldClassName}>
          <option value='all'>{t("store.allCategories")}</option>
          {Object.entries(CATEGORY_KEYS).map(([value, key]) => (
            <option key={value} value={value}>
              {t(`categories.${key}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("store.sortLabel")}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className={cn(fieldClassName, "ml-auto")}>
          <option value='default'>{t("store.sort.default")}</option>
          <option value='updated'>{t("store.sort.updated")}</option>
          <option value='downloads'>{t("store.sort.downloads")}</option>
          <option value='rating'>{t("store.sort.rating")}</option>
        </select>
      </div>

      {mods.length > 0 ? (
        <div className='grid grid-cols-4 gap-4 py-4'>
          {mods.map((mod) => (
            <ModCard key={mod.id} mod={mod} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={MagnifyingGlassIcon}
          title={t("store.empty.title")}
          description={t("store.empty.description")}
        />
      )}
    </div>
  );
};
