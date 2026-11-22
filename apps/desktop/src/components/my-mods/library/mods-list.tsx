import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import type { ModGroupActions } from "@/components/my-mods/mod-group-enablement";
import { LibraryModGroups } from "@/components/my-mods/library-mod-groups";
import { DraggableLibraryMod } from "@/components/my-mods/draggable-library-mod";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { ModConflictStatus } from "@/lib/mods/conflicts";
import { cn } from "@/lib/utils";
import type { ModHealth } from "@/types/generated/ModHealth";
import { type LocalMod } from "@/types/mods";
import { ViewMode } from "@/components/my-mods/library/library-types";
import { GridModCard } from "@/components/my-mods/library/grid-mod-card";
import { ListModCard } from "@/components/my-mods/library/list-mod-card";

export const ModsList = ({
  mods,
  allMods,
  revealMatches,
  showEmptyGroups,
  viewMode,
  conflictStatusByMod,
  onShowConflicts,
  healthById,
  contextMenuHint,
  selection,
  groupActions,
  onSelectMod,
}: {
  onSelectMod: (id: string) => void;
  groupActions: ModGroupActions;
  selection: {
    active: boolean;
    ids: ReadonlySet<string>;
    busy: boolean;
    /** `extend` selects the range from the last toggled mod. */
    toggle: (id: string, extend: boolean) => void;
  };
  healthById: ReadonlyMap<string, ModHealth>;
  mods: LocalMod[];
  allMods: LocalMod[];
  revealMatches: boolean;
  showEmptyGroups: boolean;
  viewMode: ViewMode;
  conflictStatusByMod: ReadonlyMap<string, ModConflictStatus>;
  onShowConflicts: () => void;
  /** Points the right-click hint at the first card. */
  contextMenuHint: boolean;
}) => {
  const { t } = useTranslation();
  const ModCard = viewMode === ViewMode.GRID ? GridModCard : ListModCard;
  const profileId = usePersistedStore((state) => state.activeProfileId);
  return (
    <LibraryModGroups
      key={profileId}
      mods={mods}
      allMods={allMods}
      revealMatches={revealMatches}
      showEmptyGroups={showEmptyGroups}
      selectedIds={selection.ids}
      actions={groupActions}
      renderMods={(members, draggable) => (
        <div
          className={
            viewMode === ViewMode.GRID
              ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3"
              : "flex flex-col gap-2"
          }>
          {members.map((mod, index) => {
            const selected = selection.ids.has(mod.remoteId);
            return (
              <DraggableLibraryMod
                id={mod.remoteId}
                disabled={!draggable || selection.busy}
                key={mod.remoteId}>
                <div
                  inert={selection.busy}
                  key={mod.remoteId}
                  onClickCapture={
                    selection.active
                      ? undefined
                      : (event) => {
                          if (
                            !(event.ctrlKey || event.metaKey || event.shiftKey)
                          )
                            return;
                          event.preventDefault();
                          event.stopPropagation();
                          selection.toggle(mod.remoteId, false);
                        }
                  }
                  className={cn(
                    "group/select relative h-full rounded-xl transition-opacity",
                    selection.active && "select-none",
                    selected && "outline-2 outline-primary -outline-offset-2",
                    selection.active &&
                      selection.ids.size > 0 &&
                      !selected &&
                      "opacity-60 hover:opacity-100",
                  )}>
                  <Checkbox
                    aria-label={t("myMods.selection.selectMod", {
                      name: mod.name,
                    })}
                    checked={selected}
                    disabled={selection.busy}
                    onClick={(event) => {
                      event.preventDefault();
                      selection.toggle(mod.remoteId, event.shiftKey);
                    }}
                    className={cn(
                      "absolute top-2 left-2 z-20 size-5 rounded-full border-2 border-white/80 bg-black/50 shadow-md transition-opacity data-[state=checked]:border-primary [&_svg]:size-3.5",
                      !selection.active &&
                        "opacity-0 group-hover/select:opacity-100 focus-visible:opacity-100",
                    )}
                  />
                  {selection.active && (
                    <button
                      aria-hidden
                      data-library-selection-surface
                      className='absolute inset-0 z-10 cursor-pointer rounded-xl'
                      onClick={(event) =>
                        selection.toggle(mod.remoteId, event.shiftKey)
                      }
                      onContextMenu={(event) => {
                        // The surface covers the card, so hand the right-click
                        // to the card's own context menu underneath.
                        event.preventDefault();
                        const surface = event.currentTarget;
                        document
                          .elementsFromPoint(event.clientX, event.clientY)
                          .find((element) => element !== surface)
                          ?.dispatchEvent(
                            new MouseEvent("contextmenu", {
                              bubbles: true,
                              cancelable: true,
                              clientX: event.clientX,
                              clientY: event.clientY,
                            }),
                          );
                      }}
                      tabIndex={-1}
                      type='button'
                    />
                  )}
                  <ModCard
                    conflictStatus={conflictStatusByMod.get(mod.remoteId)}
                    contextMenuHint={
                      !selection.active && contextMenuHint && index === 0
                    }
                    mod={mod}
                    onSelect={onSelectMod}
                    selected={selected}
                    onShowConflicts={onShowConflicts}
                    health={healthById.get(mod.remoteId)}
                  />
                </div>
              </DraggableLibraryMod>
            );
          })}
        </div>
      )}
    />
  );
};
