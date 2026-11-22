import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FoundryEntry, FoundryManifest } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { FoundryEntryList } from "./foundry-entry-list";

type GroupId =
  | "models"
  | "materials"
  | "textures"
  | "cards"
  | "sounds"
  | "other";
type Filter = "all" | "models" | "materials" | "textures";

const GROUPS: GroupId[] = [
  "models",
  "materials",
  "textures",
  "cards",
  "sounds",
  "other",
];
const FILTERS: Filter[] = ["all", "models", "materials", "textures"];

/**
 * A `.vmdl_c` assembles the whole character, so it leads the models; the loose
 * `.vmesh_c` parts follow.
 */
const modelRank = (entry: FoundryEntry): number =>
  entry.path.endsWith(".vmdl_c") ? 0 : entry.path.endsWith(".vmesh_c") ? 1 : 2;

const groupEntries = (manifest: FoundryManifest) =>
  ({
    models: [...manifest.models].sort((a, b) => modelRank(a) - modelRank(b)),
    materials: manifest.materials,
    textures: manifest.textures,
    cards: manifest.cards,
    sounds: manifest.sounds,
    other: manifest.other,
  }) satisfies Record<GroupId, FoundryEntry[]>;

/** The asset browser's left column: every file in the VPK, grouped by type. */
export const FoundryAssetsRail = () => {
  const { t } = useTranslation();
  const {
    manifest,
    selectedEntryPath,
    setSelectedEntryPath,
    editedPaths,
    primaryModelPath,
  } = useFoundry();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const groups = useMemo(
    () => (manifest ? groupEntries(manifest) : null),
    [manifest],
  );
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!groups) return [];
    return GROUPS.filter((id) => filter === "all" || id === filter)
      .map((id) => ({
        id,
        total: groups[id].length,
        entries: q
          ? groups[id].filter((entry) => entry.path.toLowerCase().includes(q))
          : groups[id],
      }))
      .filter((group) => group.entries.length > 0);
  }, [groups, filter, q]);

  const onSelect = useCallback(
    (entry: FoundryEntry) => setSelectedEntryPath(entry.path),
    [setSelectedEntryPath],
  );

  if (!manifest) return null;

  return (
    <>
      <div className='shrink-0 space-y-2.5 border-b p-3 pb-2.5'>
        <SearchInput
          className='h-8 text-xs md:text-xs'
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("foundry.assets.filter", {
            count: manifest.entryCount,
            formattedCount: manifest.entryCount.toLocaleString(),
          })}
          value={query}
        />
        <div className='flex gap-1'>
          {FILTERS.map((id) => (
            <button
              aria-pressed={filter === id}
              className={cn(
                "rounded-[5px] border px-2 py-[3px] font-medium text-[11px] transition-colors",
                filter === id
                  ? "border-transparent bg-secondary font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              key={id}
              onClick={() => setFilter(id)}
              type='button'>
              {t(`foundry.assets.groups.${id}`)}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className='min-h-0 flex-1'>
        <div className='space-y-3 p-2'>
          {visible.length === 0 ? (
            <p className='px-2 py-6 text-center text-muted-foreground text-xs'>
              {t(q ? "foundry.assets.noMatches" : "foundry.tabs.assetsEmpty")}
            </p>
          ) : (
            visible.map((group) => (
              <section key={group.id}>
                <h3 className='flex gap-1.5 px-1.5 pb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
                  {t(`foundry.assets.groups.${group.id}`)}
                  <span className='font-mono font-medium text-muted-foreground/60'>
                    {group.total.toLocaleString()}
                  </span>
                </h3>
                <FoundryEntryList
                  editedPaths={editedPaths}
                  entries={group.entries}
                  onSelect={onSelect}
                  primaryPath={primaryModelPath}
                  selectedPath={selectedEntryPath}
                />
              </section>
            ))
          )}
        </div>
      </ScrollArea>

      <div className='flex shrink-0 items-center gap-1.5 border-t px-3.5 py-2.5 text-[11px] text-muted-foreground'>
        {editedPaths.size > 0 && (
          <span className='h-1.5 w-1.5 rounded-full bg-orange-400' />
        )}
        {editedPaths.size > 0
          ? t("foundry.assets.edited", { count: editedPaths.size })
          : t("foundry.assets.noEdits")}
      </div>
    </>
  );
};
