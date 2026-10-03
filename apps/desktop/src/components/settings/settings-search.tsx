import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type SettingsSearchResult,
  searchSettings,
} from "@/lib/settings-search";

type SettingsSearchProps = {
  /** Navigation shown while the query is empty. */
  children: React.ReactNode;
  onSelect: (result: SettingsSearchResult) => void;
};

export const SettingsSearch = ({ children, onSelect }: SettingsSearchProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const results = useMemo(
    () => searchSettings(query, (key) => t(key)),
    [query, t],
  );

  useEffect(() => {
    const focusOnFind = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", focusOnFind);
    return () => window.removeEventListener("keydown", focusOnFind);
  }, []);

  const handleSelect = (result: SettingsSearchResult) => {
    setQuery("");
    onSelect(result);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && results[0]) {
      handleSelect(results[0]);
    } else if (event.key === "Escape") {
      setQuery("");
    }
  };

  return (
    <div className='flex flex-col gap-1'>
      <div className='px-2 pt-2'>
        <SearchInput
          aria-label={t("settings.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("settings.searchPlaceholder")}
          ref={inputRef}
          value={query}
        />
      </div>

      {query.trim() === "" ? (
        children
      ) : (
        <ul className='flex flex-col gap-0.5 p-2'>
          {results.length === 0 && (
            <li className='px-3 py-2 text-muted-foreground text-sm'>
              {t("settings.searchNoResults")}
            </li>
          )}
          {results.map((result) => (
            <li key={`${result.tab}/${result.sectionId}/${result.titleKey}`}>
              <button
                className='flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none'
                onClick={() => handleSelect(result)}
                type='button'>
                <span className='font-medium text-foreground text-sm'>
                  {result.title}
                </span>
                <span className='text-[11px] text-muted-foreground/80'>
                  {result.breadcrumb}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
