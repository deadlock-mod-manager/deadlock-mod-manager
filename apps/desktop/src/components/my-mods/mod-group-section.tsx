import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@deadlock-mods/ui/components/dialog";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  EllipsisVertical,
  FolderOpen,
  GripVertical,
  Pencil,
  Trash2,
} from "@deadlock-mods/ui/icons";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ModGroupForm } from "@/components/my-mods/mod-group-form";
import { ModGroupDropZone } from "@/components/my-mods/mod-group-drop-zone";
import {
  ModGroupEnablement,
  type ModGroupActions,
} from "@/components/my-mods/mod-group-enablement";
import { useModGroupDrag } from "@/hooks/use-mod-group-drag";
import { cn } from "@/lib/utils";
import { usePersistedStore } from "@/lib/store";
import type { ModGroup, ProfileId } from "@/types/profiles";

export const ModGroupSection = ({
  group,
  profileId,
  count,
  total,
  first,
  last,
  revealMatches,
  children,
  actions,
}: {
  group: ModGroup;
  profileId: ProfileId;
  count: number;
  total: number;
  first: boolean;
  last: boolean;
  revealMatches: boolean;
  children: ReactNode;
  actions: ModGroupActions;
}) => {
  const { t } = useTranslation();
  const contentId = useId();
  const [renaming, setRenaming] = useState(false);
  const toggle = usePersistedStore((state) => state.toggleModGroup);
  const remove = usePersistedStore((state) => state.deleteModGroup);
  const move = usePersistedStore((state) => state.moveModGroup);
  const expanded = revealMatches || !group.collapsed;
  const { draggable, droppable } = useModGroupDrag(
    profileId,
    group,
    actions.busy,
  );
  return (
    <section
      ref={draggable.setNodeRef}
      data-mod-group={group.id}
      className={cn("space-y-3", draggable.isDragging && "opacity-40")}
      aria-label={group.name}>
      <div
        ref={droppable.setNodeRef}
        data-mod-group-header={group.id}
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border-b border-border/60 pb-2",
          droppable.isOver && "bg-primary/10 ring-1 ring-primary/50",
        )}>
        <Button
          {...draggable.attributes}
          {...draggable.listeners}
          size='icon'
          variant='ghost'
          className='cursor-grab touch-none'
          disabled={actions.busy}
          aria-label={t("myMods.groups.reorder", { name: group.name })}>
          <GripVertical className='size-4' />
        </Button>
        <Button
          variant='ghost'
          className='min-w-0 flex-1 justify-start px-2'
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => toggle(profileId, group.id)}
          disabled={revealMatches || actions.busy}>
          {expanded ? (
            <ChevronDown className='size-4 shrink-0' />
          ) : (
            <ChevronRight className='size-4 shrink-0' />
          )}
          <FolderOpen className='size-4 shrink-0 text-muted-foreground' />
          <span className='truncate'>{group.name}</span>
          <span className='text-xs text-muted-foreground'>
            {count === total
              ? t("myMods.groups.count", { count })
              : t("myMods.groups.pageCount", { count, total })}
          </span>
        </Button>
        <ModGroupEnablement group={group} actions={actions} />
        <Dialog open={renaming} onOpenChange={setRenaming}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size='icon'
                variant='ghost'
                disabled={actions.busy}
                aria-label={t("myMods.groups.actions", { name: group.name })}>
                <EllipsisVertical className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              onCloseAutoFocus={(event) => {
                if (renaming) event.preventDefault();
              }}>
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil className='size-4' />
                {t("myMods.groups.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={first}
                onSelect={() => move(profileId, group.id, -1)}>
                <ArrowUp className='size-4' />
                {t("myMods.groups.moveUp")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={last}
                onSelect={() => move(profileId, group.id, 1)}>
                <ArrowDown className='size-4' />
                {t("myMods.groups.moveDown")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => remove(profileId, group.id)}>
                <Trash2 className='size-4' />
                {t("myMods.groups.delete")}
              </DropdownMenuItem>
              <p className='max-w-60 px-2 py-1 text-xs text-muted-foreground'>
                {t("myMods.groups.deleteHelp")}
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("myMods.groups.rename")}</DialogTitle>
              <DialogDescription>
                {t("myMods.groups.description")}
              </DialogDescription>
            </DialogHeader>
            <ModGroupForm
              profileId={profileId}
              group={group}
              onDone={() => setRenaming(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
      <ModGroupDropZone groupId={group.id} name={group.name} />
      {expanded && (
        <div id={contentId}>
          {count > 0 ? (
            children
          ) : (
            <p className='px-2 py-3 text-sm text-muted-foreground'>
              {t(
                group.modIds.length > 0
                  ? "myMods.groups.noMatches"
                  : "myMods.groups.empty",
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
