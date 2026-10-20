import { FolderInput } from "@deadlock-mods/ui/icons";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { isModGroupDrag, modGroupDropId } from "@/lib/mods/library-groups";
import { cn } from "@/lib/utils";

export const ModGroupDropZone = ({
  groupId,
  name,
}: {
  groupId: string | null;
  name: string;
}) => {
  const { t } = useTranslation();
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({
    id: modGroupDropId(groupId),
  });
  if (!active || isModGroupDrag(active.id)) return null;
  return (
    <div
      ref={setNodeRef}
      data-mod-group-drop={groupId ?? "ungrouped"}
      className={cn(
        "relative flex min-h-20 items-center justify-center gap-2 rounded-lg text-sm transition-colors duration-150",
        isOver
          ? "bg-primary/15 text-primary"
          : "bg-primary/5 text-muted-foreground",
      )}>
      <span
        aria-hidden='true'
        className={cn(
          "pointer-events-none absolute inset-0 rounded-lg border-2 border-dotted border-primary/60 motion-safe:animate-pulse",
          isOver && "border-primary",
        )}
      />
      <FolderInput className='size-5 shrink-0' />
      <span>
        {t(isOver ? "myMods.groups.releaseToMove" : "myMods.groups.dropHere", {
          name,
        })}
      </span>
    </div>
  );
};
