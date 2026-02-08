import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { GripVertical, Loader2, Save, X } from "@deadlock-mods/ui/icons";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

interface ModOrderingDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SortableModItemProps {
  mod: LocalMod;
  index: number;
}

const SortableModItem = ({ mod, index }: SortableModItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mod.remoteId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className='flex items-center space-x-3 rounded-lg border bg-background p-3 shadow-sm'>
      <div
        {...attributes}
        {...listeners}
        className='cursor-grab touch-none text-muted-foreground hover:text-foreground'>
        <GripVertical className='h-4 w-4' />
      </div>

      <div className='flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary text-sm font-medium'>
        {index + 1}
      </div>

      <div className='flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-secondary'>
        {mod.images && mod.images.length > 0 ? (
          <img
            src={mod.images[0]}
            alt={mod.name}
            className='h-full w-full object-cover'
          />
        ) : (
          <div className='text-muted-foreground text-xs'>No Image</div>
        )}
      </div>

      <div className='flex-1 min-w-0'>
        <div className='flex items-center space-x-2'>
          <p className='font-medium text-sm truncate'>{mod.name}</p>
          {mod.isAudio && <Badge variant='secondary'>Audio</Badge>}
          {mod.remoteUrl?.startsWith("local://") && (
            <Badge variant='outline'>Custom</Badge>
          )}
        </div>
        <p className='text-muted-foreground text-xs truncate'>
          by {mod.author}
        </p>
      </div>

      <div className='text-muted-foreground text-xs'>
        {mod.installedVpks?.length || 0} VPK
        {(mod.installedVpks?.length || 0) !== 1 ? "s" : ""}
      </div>
    </div>
  );
};

export const ModOrderingDialog = ({
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ModOrderingDialogProps) => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const {
    getOrderedMods,
    reorderMods,
    updateModVpksAfterReorder,
    migrateLegacyMods,
    getActiveProfile,
  } = usePersistedStore();
  const [orderedMods, setOrderedMods] = useState<LocalMod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [reorderStartTime, setReorderStartTime] = useState<number | null>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (controlledOnOpenChange ?? (() => {}))
    : setInternalOpen;

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      migrateLegacyMods();
      setOrderedMods(getOrderedMods());
      setReorderStartTime(Date.now());
    }
    setOpen(isOpen);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOrderedMods((items) => {
        const oldIndex = items.findIndex((item) => item.remoteId === active.id);
        const newIndex = items.findIndex((item) => item.remoteId === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      const modOrderData = orderedMods.map((mod, index) => [
        mod.remoteId,
        mod.installedVpks || [],
        index,
      ]);

      // Call the backend to reorder VPKs and get updated mappings
      const updatedVpkMappings = await invoke<Array<[string, string[]]>>(
        "reorder_mods_by_remote_id",
        { modOrderData, profileFolder },
      );

      // Update the frontend store with the new install order
      const orderedRemoteIds = orderedMods.map((mod) => mod.remoteId);
      reorderMods(orderedRemoteIds);

      updateModVpksAfterReorder(updatedVpkMappings);

      const durationSeconds = reorderStartTime
        ? (Date.now() - reorderStartTime) / 1000
        : 0;

      analytics.trackModsReordered({
        mod_count: orderedMods.length,
        reorder_method: "drag_drop",
        duration_seconds: durationSeconds,
      });

      toast.success(t("modOrdering.orderSaved"));
      setOpen(false);
    } catch (error) {
      toast.error(t("modOrdering.orderSaveFailed"));
      console.error("Failed to save mod order:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setOrderedMods(getOrderedMods());
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children && (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{children}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("modOrdering.manageOrderTooltip")}</TooltipContent>
        </Tooltip>
      )}
      <DialogContent className='max-w-2xl max-h-[80vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>{t("modOrdering.title")}</DialogTitle>
          <DialogDescription>{t("modOrdering.description")}</DialogDescription>
        </DialogHeader>

        <div className='flex-1 overflow-hidden'>
          {orderedMods.length === 0 ? (
            <div className='flex items-center justify-center py-8 text-muted-foreground'>
              {t("modOrdering.noMods")}
            </div>
          ) : (
            <div className='space-y-2 overflow-y-auto max-h-[60vh] pr-2'>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}>
                <SortableContext
                  items={orderedMods.map((mod) => mod.remoteId)}
                  strategy={verticalListSortingStrategy}>
                  {orderedMods.map((mod, index) => (
                    <SortableModItem
                      key={mod.remoteId}
                      mod={mod}
                      index={index}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>

        <DialogFooter className='flex justify-between'>
          <Button variant='outline' onClick={handleCancel} disabled={isLoading}>
            <X className='mr-2 h-4 w-4' />
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || orderedMods.length === 0}>
            {isLoading ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Save className='mr-2 h-4 w-4' />
            )}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
