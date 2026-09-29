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
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";
import {
  type LocalizationChoice,
  LocalizationConflictReview,
  type LocalizationOverlayAnalysis,
} from "./localization-conflict-review";

interface ModOrderingDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SortableModItemProps {
  mod: LocalMod;
  index: number;
}

interface LocalizationResolution {
  conflictKey: string;
  winnerModId: string | null;
  winnerValue: string | null;
  winnerSourceVpk: string | null;
  useVanilla: boolean;
}

interface LocalizationOverlayApplyResult {
  hasOverlay: boolean;
  outputPath: string | null;
  packedFiles: number;
  appliedTokens: number;
  appliedCompiledRows: number;
}

interface SaveOrderResult {
  analysis: LocalizationOverlayAnalysis;
  orderedRemoteIds: string[];
  updatedVpkMappings: Array<[string, string[]]>;
}

const SortableModItem = ({ mod, index }: SortableModItemProps) => {
  const { t } = useTranslation();
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
          <p
            data-testid='ordered-mod-name'
            className='font-medium text-sm truncate'>
            {mod.name}
          </p>
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
        {t("modOrdering.vpkCount", { count: mod.installedVpks?.length || 0 })}
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
  const [internalOpen, setInternalOpen] = useState(false);
  const [reorderStartTime, setReorderStartTime] = useState<number | null>(null);
  const [localizationAnalysis, setLocalizationAnalysis] =
    useState<LocalizationOverlayAnalysis | null>(null);
  const [localizationChoices, setLocalizationChoices] = useState<
    Record<string, LocalizationChoice>
  >({});

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (controlledOnOpenChange ?? (() => {}))
    : setInternalOpen;

  useEffect(() => {
    if (open) {
      migrateLegacyMods();
      setOrderedMods(getOrderedMods());
      setReorderStartTime(Date.now());
    }
  }, [open]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setLocalizationAnalysis(null);
      setLocalizationChoices({});
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

  const saveOrderMutation = useMutation<SaveOrderResult, Error>({
    mutationFn: async () => {
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
      const orderedRemoteIds = orderedMods.map((mod) => mod.remoteId);
      const analysis = await invoke<LocalizationOverlayAnalysis>(
        "analyze_localization_overlay",
        { profileFolder },
      );
      if (
        analysis.conflicts.length === 0 &&
        analysis.compiledDataConflicts.length === 0 &&
        analysis.heroIdReassignments.length === 0 &&
        analysis.snapshotWarnings.length === 0 &&
        analysis.parseWarnings.length === 0
      ) {
        await invoke<LocalizationOverlayApplyResult>(
          "apply_localization_overlay",
          { profileFolder, resolutions: [] },
        );
      }
      return { analysis, orderedRemoteIds, updatedVpkMappings };
    },
    onSuccess: ({ analysis, orderedRemoteIds, updatedVpkMappings }) => {
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

      if (
        analysis.conflicts.length > 0 ||
        analysis.compiledDataConflicts.length > 0 ||
        analysis.heroIdReassignments.length > 0 ||
        analysis.snapshotWarnings.length > 0 ||
        analysis.parseWarnings.length > 0
      ) {
        setLocalizationAnalysis(analysis);
        setLocalizationChoices({});
        return;
      }
      toast.success(t("modOrdering.orderSaved"));
      setOpen(false);
    },
    onError: (error) => {
      toast.error(t("modOrdering.orderSaveFailed"), {
        description: error.message,
      });
      console.error("Failed to save mod order:", error);
    },
  });

  const applyLocalizationMutation = useMutation<
    LocalizationOverlayApplyResult,
    Error,
    LocalizationResolution[]
  >({
    mutationFn: async (resolutions) => {
      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;
      return await invoke<LocalizationOverlayApplyResult>(
        "apply_localization_overlay",
        { profileFolder, resolutions },
      );
    },
    onSuccess: (result) => {
      toast.success(t("modOrdering.localization.applied"), {
        description: t("modOrdering.localization.appliedDescription", {
          count: result.appliedTokens,
          rows: result.appliedCompiledRows,
        }),
      });
      setLocalizationAnalysis(null);
      setLocalizationChoices({});
      setOpen(false);
    },
    onError: (error) => {
      toast.error(t("modOrdering.localization.applyFailed"), {
        description: error.message,
      });
    },
  });

  const handleSave = () => {
    saveOrderMutation.mutate();
  };

  const handleApplyLocalization = () => {
    if (!localizationAnalysis) return;
    const resolutions = localizationAnalysis.conflicts.reduce<
      LocalizationResolution[]
    >((current, conflict) => {
      const choice = localizationChoices[conflict.key] ?? "load-order";
      if (choice === "load-order") return current;
      if (choice === "vanilla") {
        current.push({
          conflictKey: conflict.key,
          winnerModId: null,
          winnerValue: null,
          winnerSourceVpk: null,
          useVanilla: true,
        });
        return current;
      }
      const candidateIndex = Number(choice.slice("candidate:".length));
      const candidate = conflict.candidates[candidateIndex];
      if (!candidate) return current;
      current.push({
        conflictKey: conflict.key,
        winnerModId: candidate.modId,
        winnerValue: candidate.value,
        winnerSourceVpk: candidate.sourceVpk,
        useVanilla: false,
      });
      return current;
    }, []);
    for (const conflict of localizationAnalysis.compiledDataConflicts) {
      const choice = localizationChoices[conflict.key] ?? "load-order";
      if (choice === "load-order") continue;
      if (choice === "vanilla") {
        resolutions.push({
          conflictKey: conflict.key,
          winnerModId: null,
          winnerValue: null,
          winnerSourceVpk: null,
          useVanilla: true,
        });
        continue;
      }
      const candidateIndex = Number(choice.slice("candidate:".length));
      const candidate = conflict.candidates[candidateIndex];
      if (!candidate) continue;
      resolutions.push({
        conflictKey: conflict.key,
        winnerModId: candidate.modId,
        winnerValue: null,
        winnerSourceVpk: candidate.sourceVpk,
        useVanilla: false,
      });
    }
    applyLocalizationMutation.mutate(resolutions);
  };

  const handleCancel = () => {
    if (localizationAnalysis) {
      setLocalizationAnalysis(null);
      setLocalizationChoices({});
      return;
    }
    setOrderedMods(getOrderedMods());
    setOpen(false);
  };

  const isLoading =
    saveOrderMutation.isPending || applyLocalizationMutation.isPending;
  const modNames = new Map(orderedMods.map((mod) => [mod.remoteId, mod.name]));

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
      <DialogContent className='flex max-h-[82vh] max-w-2xl flex-col overflow-hidden'>
        <DialogHeader className='shrink-0 gap-1 space-y-0 pr-8'>
          <DialogTitle className='leading-snug'>
            {localizationAnalysis
              ? t("modOrdering.localization.title")
              : t("modOrdering.title")}
          </DialogTitle>
          <DialogDescription className='max-w-[68ch] leading-relaxed'>
            {localizationAnalysis
              ? t("modOrdering.localization.description")
              : t("modOrdering.description")}
          </DialogDescription>
        </DialogHeader>

        <div className='flex min-h-0 flex-1 overflow-hidden'>
          {localizationAnalysis ? (
            <LocalizationConflictReview
              analysis={localizationAnalysis}
              choices={localizationChoices}
              modNames={modNames}
              onChoiceChange={(conflictKey, choice) =>
                setLocalizationChoices((current) => ({
                  ...current,
                  [conflictKey]: choice,
                }))
              }
            />
          ) : orderedMods.length === 0 ? (
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

        <DialogFooter className='flex shrink-0 justify-between border-t pt-4'>
          <Button variant='outline' onClick={handleCancel} disabled={isLoading}>
            <X className='mr-2 h-4 w-4' />
            {localizationAnalysis ? t("common.back") : t("common.cancel")}
          </Button>
          <Button
            onClick={
              localizationAnalysis ? handleApplyLocalization : handleSave
            }
            disabled={isLoading || orderedMods.length === 0}>
            {isLoading ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Save className='mr-2 h-4 w-4' />
            )}
            {localizationAnalysis
              ? t("modOrdering.localization.apply")
              : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
