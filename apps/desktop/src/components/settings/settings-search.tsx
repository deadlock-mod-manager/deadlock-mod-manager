import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { platform } from "@tauri-apps/plugin-os";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import {
  SETTINGS_SEARCH_INDEX,
  type SettingsSearchResult,
  searchSettings,
} from "@/lib/settings-search";
import { usePersistedStore } from "@/lib/store";

const SEARCH_HINT_MIN_VISITS = 3;

type SettingsSearchProps = {
  /** Navigation shown while the query is empty. */
  children: React.ReactNode;
  onSelect: (result: SettingsSearchResult) => void;
};

export const SettingsSearch = ({ children, onSelect }: SettingsSearchProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);
  const settingsVisits = usePersistedStore(
    (state) => state.featureHints.counters.settingsVisits ?? 0,
  );

  useEffect(() => {
    usePersistedStore.getState().countFeatureHintEvent("settingsVisits");
  }, []);

  const results = useMemo(
    () =>
      searchSettings(query, (key) => t(key), SETTINGS_SEARCH_INDEX, platform()),
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
        markFeatureUsed("settings-search");
      }
    };
    window.addEventListener("keydown", focusOnFind);
    return () => window.removeEventListener("keydown", focusOnFind);
  }, [markFeatureUsed]);

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
        <HintAnchor
          eligible={settingsVisits >= SEARCH_HINT_MIN_VISITS}
          hintId='settings-search'
          onShowMe={() => inputRef.current?.focus()}
          side='right'>
          <SearchInput
            aria-label={t("settings.searchPlaceholder")}
            onChange={(event) => {
              setQuery(event.target.value);
              markFeatureUsed("settings-search");
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("settings.searchPlaceholder")}
            ref={inputRef}
            value={query}
          />
        </HintAnchor>
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
