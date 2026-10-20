import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { useEffect } from "react";
import {
  isModGroupDrag,
  modGroupDragId,
  modGroupHeaderId,
} from "@/lib/mods/library-groups";
import { usePersistedStore } from "@/lib/store";
import type { ModGroup, ProfileId } from "@/types/profiles";

export const useModGroupDrag = (
  profileId: ProfileId,
  group: ModGroup,
  disabled: boolean,
) => {
  const { active } = useDndContext();
  const draggable = useDraggable({ id: modGroupDragId(group.id), disabled });
  const droppable = useDroppable({ id: modGroupHeaderId(group.id), disabled });
  const setCollapsed = usePersistedStore(
    (state) => state.setModGroupsCollapsed,
  );
  const shouldExpand =
    !disabled &&
    droppable.isOver &&
    group.collapsed &&
    active !== null &&
    !isModGroupDrag(active.id);
  useEffect(() => {
    if (!shouldExpand) return;
    const timer = setTimeout(
      () => setCollapsed(profileId, false, group.id),
      600,
    );
    return () => clearTimeout(timer);
  }, [shouldExpand, profileId, group.id, setCollapsed]);
  return { draggable, droppable };
};
