import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  formatBool,
  parseBool,
  sameValue,
} from "@/lib/performance/editor/values";
import {
  findOverride,
  isDevtoolEnabled,
  withOverride,
} from "@/lib/performance/overrides";
import {
  authorViewEntries,
  devtoolEntries,
} from "@/lib/performance/resolved-summary";
import { usePersistedStore } from "@/lib/store";
import type { ConvarKind } from "@/types/generated/ConvarKind";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { OverrideAction } from "@/types/generated/OverrideAction";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { DetailsSection, EntryKey, entryKey } from "./details-parts";

/** The default in the config's spelling, so a bool reads `0 (default 1)`, not `0 (default true)`. */
const defaultText = (
  defaultValue: string,
  kind: ConvarKind,
  styleOf: string,
) => {
  const on = kind === "bool" ? parseBool(defaultValue) : null;
  return on === null ? defaultValue : formatBool(on, styleOf);
};

const useValueText = () => {
  const { t } = useTranslation();
  return (entry: ResolvedEntry) => {
    const kind = entry.meta?.kind ?? null;
    const value =
      entry.configValue ?? t("performance.details.view.commentedOut");
    const clamped = entry.notes.find((note) => note.kind === "clamped");
    const changesLive =
      entry.liveValue !== null &&
      (entry.configValue === null ||
        !sameValue(entry.liveValue, entry.configValue, kind));
    const shown = changesLive ? `${entry.liveValue} → ${value}` : value;
    if (clamped?.kind === "clamped") {
      return t("performance.details.view.gameUses", {
        value: shown,
        effective: clamped.effective,
      });
    }
    const defaultValue = entry.meta?.default;
    if (entry.liveValue === null && entry.meta && defaultValue) {
      if (
        entry.configValue !== null &&
        sameValue(entry.configValue, defaultValue, kind)
      ) {
        return t("performance.details.view.isDefault", { value: shown });
      }
      return t("performance.details.view.withDefault", {
        value: shown,
        default: defaultText(defaultValue, entry.meta.kind, value),
      });
    }
    return shown;
  };
};

const EntrySwitchRow = ({
  entry,
  checked,
  onCheckedChange,
}: {
  entry: ResolvedEntry;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => {
  const valueText = useValueText();
  const id = `view-entry-${entryKey(entry)}`;
  return (
    <li className='flex items-start gap-3 py-1.5'>
      <Switch
        aria-describedby={`${id}-value`}
        checked={checked}
        className='mt-0.5'
        id={id}
        onCheckedChange={onCheckedChange}
      />
      <label className='flex min-w-0 flex-1 flex-col' htmlFor={id}>
        <EntryKey className='block' entry={entry} />
        {entry.meta?.label && (
          <span
            className='truncate text-muted-foreground text-xs'
            title={entry.meta.description ?? entry.meta.help ?? undefined}>
            {entry.meta.label}
          </span>
        )}
      </label>
      <span
        className='shrink-0 pt-0.5 font-mono text-muted-foreground text-xs'
        id={`${id}-value`}>
        {valueText(entry)}
      </span>
    </li>
  );
};

const SEARCH_THRESHOLD = 8;

const matchesQuery = (entry: ResolvedEntry, query: string) =>
  [entryKey(entry), entry.meta?.label, entry.meta?.description].some((text) =>
    text?.toLowerCase().includes(query),
  );

const EntrySwitchList = ({
  entries,
  isChecked,
  onCheckedChange,
}: {
  entries: ResolvedEntry[];
  isChecked: (entry: ResolvedEntry) => boolean;
  onCheckedChange: (entry: ResolvedEntry, checked: boolean) => void;
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const shown = query
    ? entries.filter((entry) => matchesQuery(entry, query))
    : entries;

  return (
    <div className='flex flex-col gap-2'>
      {entries.length > SEARCH_THRESHOLD && (
        <SearchInput
          className='h-8'
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("performance.editor.toolbar.search", {
            count: entries.length,
          })}
          value={search}
        />
      )}
      {shown.length === 0 ? (
        <p className='py-1.5 text-muted-foreground text-xs'>
          {t("performance.details.view.noMatches", { query: search.trim() })}
        </p>
      ) : (
        <ul className='flex flex-col'>
          {shown.map((entry) => (
            <EntrySwitchRow
              checked={isChecked(entry)}
              entry={entry}
              key={entryKey(entry)}
              onCheckedChange={(checked) => onCheckedChange(entry, checked)}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Camera and visibility settings follow the author and can be switched off;
 * developer and hideout tools stay off unless switched on. Each switch is a
 * saved tweak for this config.
 */
export const AuthorViewSettings = ({
  configId,
  entries,
  overrides,
}: {
  configId: string;
  entries: ResolvedEntry[];
  overrides: EntryOverride[];
}) => {
  const { t } = useTranslation();
  const setPerfOverrides = usePersistedStore((state) => state.setPerfOverrides);
  const viewEntries = authorViewEntries(entries);
  const devtools = devtoolEntries(entries);

  if (viewEntries.length === 0 && devtools.length === 0) return null;

  const setAction = (path: string[], action: OverrideAction | null) =>
    setPerfOverrides(configId, withOverride(overrides, path, action));

  return (
    <>
      {viewEntries.length > 0 && (
        <DetailsSection
          description={t("performance.details.view.description")}
          title={t("performance.details.view.title")}>
          <EntrySwitchList
            entries={viewEntries}
            isChecked={(entry) =>
              findOverride(overrides, entry.path)?.action.kind !== "omit"
            }
            onCheckedChange={(entry, checked) =>
              setAction(entry.path, checked ? null : { kind: "omit" })
            }
          />
        </DetailsSection>
      )}
      {devtools.length > 0 && (
        <DetailsSection
          description={t("performance.details.devtools.description")}
          title={t("performance.details.devtools.title")}>
          <EntrySwitchList
            entries={devtools}
            isChecked={(entry) =>
              isDevtoolEnabled(findOverride(overrides, entry.path))
            }
            onCheckedChange={(entry, checked) =>
              setAction(entry.path, checked ? { kind: "enable" } : null)
            }
          />
        </DetailsSection>
      )}
    </>
  );
};
