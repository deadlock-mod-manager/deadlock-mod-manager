import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ModGroupDropZone } from "@/components/my-mods/mod-group-drop-zone";
import { ModGroupSection } from "@/components/my-mods/mod-group-section";
import type { ModGroupActions } from "@/components/my-mods/mod-group-enablement";
import { useMoveModsToGroup } from "@/hooks/use-move-mods-to-group";
import { libraryDragPreviewModifiers } from "@/lib/mods/library-drag";
import {
  groupLibraryMods,
  modGroupDragId,
  resolveModGroupDrop,
} from "@/lib/mods/library-groups";
import { usePersistedStore } from "@/lib/store";
import { EMPTY_MOD_GROUPS } from "@/lib/store/slices/mod-groups";
import type { LocalMod } from "@/types/mods";
import type { ProfileId } from "@/types/profiles";

export const LibraryModGroups = ({
  mods,
  allMods,
  revealMatches,
  showEmptyGroups,
  renderMods,
  selectedIds,
  actions,
}: {
  mods: LocalMod[];
  allMods: LocalMod[];
  revealMatches: boolean;
  showEmptyGroups: boolean;
  renderMods: (mods: LocalMod[], draggable: boolean) => ReactNode;
  selectedIds?: ReadonlySet<string>;
  actions: ModGroupActions;
}) => {
  const { t } = useTranslation();
  const profileId = usePersistedStore((state) => state.activeProfileId);
  const groups = usePersistedStore(
    (state) => state.profiles[profileId]?.modGroups ?? EMPTY_MOD_GROUPS,
  );
  const [dragged, setDragged] = useState<
    | ((
        | {
            kind: "mods";
            ids: string[];
            name: string;
          }
        | {
            kind: "group";
            id: string;
            name: string;
          }
      ) & { profileId: ProfileId })
    | null
  >(null);
  const dragging = dragged?.profileId === profileId;
  const moveMods = useMoveModsToGroup();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const { sections, ungrouped } = useMemo(
    () => groupLibraryMods(mods, groups),
    [mods, groups],
  );
  const totals = useMemo(
    () => groupLibraryMods(allMods, groups),
    [allMods, groups],
  );
  if (groups.length === 0) return renderMods(mods, false);
  return (
    <DndContext
      key={profileId}
      sensors={sensors}
      autoScroll={{ threshold: { x: 0, y: 0.05 } }}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => {
        const group = groups.find(
          (candidate) => modGroupDragId(candidate.id) === active.id,
        );
        if (group) {
          setDragged({
            kind: "group",
            id: group.id,
            name: group.name,
            profileId,
          });
          return;
        }
        const mod = mods.find((candidate) => candidate.remoteId === active.id);
        if (mod) {
          const ids = selectedIds?.has(mod.remoteId)
            ? [...selectedIds]
            : [mod.remoteId];
          setDragged({
            kind: "mods",
            ids,
            profileId,
            name:
              ids.length === 1
                ? mod.name
                : t("myMods.groups.draggingMods", { count: ids.length }),
          });
        }
      }}
      onDragCancel={() => setDragged(null)}
      onDragEnd={({ over }) => {
        if (dragged?.profileId === profileId && over) {
          const state = usePersistedStore.getState();
          const target = resolveModGroupDrop(
            over.id,
            state.profiles[profileId]?.modGroups ?? EMPTY_MOD_GROUPS,
          );
          if (state.activeProfileId === profileId && target !== undefined) {
            if (dragged.kind === "mods")
              moveMods(profileId, dragged.ids, target);
            else if (target !== null)
              state.reorderModGroup(profileId, dragged.id, target);
          }
        }
        setDragged(null);
      }}>
      <div className='space-y-6'>
        {sections.map(({ group, mods: members }, index) =>
          dragging ||
          members.length > 0 ||
          (showEmptyGroups && totals.sections[index].mods.length === 0) ? (
            <ModGroupSection
              key={`${profileId}:${group.id}`}
              group={group}
              profileId={profileId}
              count={members.length}
              total={totals.sections[index].mods.length}
              first={index === 0}
              last={index === groups.length - 1}
              revealMatches={revealMatches}
              actions={actions}>
              {renderMods(members, !actions.busy)}
            </ModGroupSection>
          ) : null,
        )}
        {(dragging || ungrouped.length > 0) && (
          <section
            className='space-y-3'
            aria-label={t("myMods.groups.ungrouped")}>
            <h3 className='border-b border-border/60 px-2 py-3 text-sm font-medium text-muted-foreground'>
              {t("myMods.groups.ungrouped")} ({totals.ungrouped.length})
            </h3>
            <ModGroupDropZone
              groupId={null}
              name={t("myMods.groups.ungrouped")}
            />
            {renderMods(ungrouped, !actions.busy)}
          </section>
        )}
      </div>
      <DragOverlay dropAnimation={null} modifiers={libraryDragPreviewModifiers}>
        {dragging && (
          <div
            data-library-drag-preview
            className='pointer-events-none max-w-64 truncate rounded-lg border border-primary/50 bg-background px-4 py-3 text-sm font-medium shadow-lg'>
            {dragged.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};
