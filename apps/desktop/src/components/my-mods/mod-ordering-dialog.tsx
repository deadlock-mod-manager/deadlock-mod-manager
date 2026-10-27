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
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Save, Undo2 } from "@deadlock-mods/ui/icons";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OrderedVpkFile } from "@/components/my-mods/mod-file-order";
import {
  DragPreview,
  SortableModRow,
} from "@/components/my-mods/mod-order-row";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { restrictToVerticalAxis } from "@/lib/mods/load-order-drag";
import { usePersistedStore } from "@/lib/store";
import type { ModVpkFiles } from "@/types/generated/ModVpkFiles";
import type { LocalMod } from "@/types/mods";

interface ModOrderingDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SaveOrderResult {
  orderedRemoteIds: string[];
  updatedVpkMappings: Array<[string, string[]]>;
}

type FileOrders = Map<string, OrderedVpkFile[]>;

// Files are only listed when the manifest names every enabled VPK; otherwise
// there is no telling which pak holds which file.
const toFileOrders = (entries: ModVpkFiles[], mods: LocalMod[]): FileOrders => {
  const modsById = new Map(mods.map((mod) => [mod.remoteId, mod]));
  const orders: FileOrders = new Map();
  for (const entry of entries) {
    if (entry.originalNames.length !== entry.vpks.length) continue;
    const archiveByName = new Map(
      (modsById.get(entry.modId)?.installedFileTree?.files ?? []).map(
        (file) => [file.name, file.archive_name],
      ),
    );
    orders.set(
      entry.modId,
      entry.vpks.map((vpk, index) => ({
        vpk,
        name: entry.originalNames[index],
        archiveName: archiveByName.get(entry.originalNames[index]) || undefined,
      })),
    );
  }
  return orders;
};

const sameFileOrder = (a?: OrderedVpkFile[], b?: OrderedVpkFile[]) =>
  (a ?? []).map((file) => file.vpk).join("|") ===
  (b ?? []).map((file) => file.vpk).join("|");

export const ModOrderingDialog = ({
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ModOrderingDialogProps) => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const getOrderedMods = usePersistedStore((state) => state.getOrderedMods);
  const reorderMods = usePersistedStore((state) => state.reorderMods);
  const updateModVpksAfterReorder = usePersistedStore(
    (state) => state.updateModVpksAfterReorder,
  );
  const setModFileOrder = usePersistedStore((state) => state.setModFileOrder);
  const migrateLegacyMods = usePersistedStore(
    (state) => state.migrateLegacyMods,
  );
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const [initialMods, setInitialMods] = useState<LocalMod[]>([]);
  const [orderedMods, setOrderedMods] = useState<LocalMod[]>([]);
  const [initialFiles, setInitialFiles] = useState<FileOrders>(new Map());
  const [fileOrders, setFileOrders] = useState<FileOrders>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [reorderStartTime, setReorderStartTime] = useState<number | null>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (controlledOnOpenChange ?? (() => {}))
    : setInternalOpen;
  const profileFolder = getActiveProfile()?.folderName ?? null;

  const { data: vpkFiles } = useQuery({
    queryKey: ["enabled-mod-vpk-files", profileFolder],
    queryFn: () =>
      invoke<ModVpkFiles[]>("get_enabled_mod_vpk_files", { profileFolder }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (open) {
      migrateLegacyMods();
      const mods = getOrderedMods();
      setInitialMods(mods);
      setOrderedMods(mods);
      setExpanded(new Set());
      setSearch("");
      setReorderStartTime(Date.now());
    }
  }, [open]);

  useEffect(() => {
    if (!open || !vpkFiles) return;
    const orders = toFileOrders(vpkFiles, getOrderedMods());
    setInitialFiles(orders);
    setFileOrders(orders);
  }, [open, vpkFiles]);

  const initialPositions = useMemo(
    () => new Map(initialMods.map((mod, index) => [mod.remoteId, index])),
    [initialMods],
  );
  const changedFileMods = useMemo(
    () =>
      [...fileOrders.keys()].filter(
        (id) => !sameFileOrder(fileOrders.get(id), initialFiles.get(id)),
      ),
    [fileOrders, initialFiles],
  );
  const movedCount = orderedMods.filter(
    (mod, index) => initialPositions.get(mod.remoteId) !== index,
  ).length;
  const isDirty = movedCount > 0 || changedFileMods.length > 0;

  const query = search.trim().toLowerCase();
  const visibleMods = query
    ? orderedMods.filter(
        (mod) =>
          mod.name.toLowerCase().includes(query) ||
          mod.author?.toLowerCase().includes(query),
      )
    : orderedMods;
  const activeIndex = orderedMods.findIndex((mod) => mod.remoteId === activeId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = ({ active }: DragStartEvent) =>
    setActiveId(String(active.id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    setOrderedMods((items) =>
      arrayMove(
        items,
        items.findIndex((item) => item.remoteId === active.id),
        items.findIndex((item) => item.remoteId === over.id),
      ),
    );
  };

  const moveMod = (remoteId: string, to: "top" | "bottom") =>
    setOrderedMods((items) => {
      const from = items.findIndex((item) => item.remoteId === remoteId);
      return arrayMove(items, from, to === "top" ? 0 : items.length - 1);
    });

  const toggleExpanded = (remoteId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(remoteId)) next.add(remoteId);
      return next;
    });

  const saveOrderMutation = useMutation<SaveOrderResult, Error>({
    mutationFn: async () => {
      // Each mod's VPKs go in their listed order; the backend keeps that order
      // when it renumbers them.
      const modOrderData = orderedMods.map((mod, index) => [
        mod.remoteId,
        fileOrders.get(mod.remoteId)?.map((file) => file.vpk) ??
          mod.installedVpks ??
          [],
        index,
      ]);

      const updatedVpkMappings = await invoke<Array<[string, string[]]>>(
        "reorder_mods_by_remote_id",
        { modOrderData, profileFolder },
      );
      const orderedRemoteIds = orderedMods.map((mod) => mod.remoteId);
      return { orderedRemoteIds, updatedVpkMappings };
    },
    onSuccess: ({ orderedRemoteIds, updatedVpkMappings }) => {
      reorderMods(orderedRemoteIds);
      updateModVpksAfterReorder(updatedVpkMappings);
      for (const remoteId of changedFileMods) {
        setModFileOrder(
          remoteId,
          (fileOrders.get(remoteId) ?? []).map((file) => file.name),
        );
      }

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
    },
    onError: (error) => {
      toast.error(t("modOrdering.orderSaveFailed"), {
        description: error.message,
      });
      console.error("Failed to save mod order:", error);
    },
  });

  const discardChanges = () => {
    setOrderedMods(initialMods);
    setFileOrders(initialFiles);
  };

  const isLoading = saveOrderMutation.isPending;
  const activeMod = activeIndex === -1 ? null : orderedMods[activeIndex];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{children}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("modOrdering.manageOrderTooltip")}</TooltipContent>
        </Tooltip>
      )}
      <DialogContent className='flex max-h-[85vh] max-w-2xl flex-col gap-3 overflow-hidden'>
        <DialogHeader className='shrink-0 gap-1 space-y-0 pr-8'>
          <DialogTitle className='leading-snug'>
            {t("modOrdering.title")}
          </DialogTitle>
          <DialogDescription className='max-w-[68ch] leading-relaxed'>
            {t("modOrdering.description")}
          </DialogDescription>
        </DialogHeader>

        {orderedMods.length === 0 ? (
          <div className='flex items-center justify-center py-10 text-muted-foreground text-sm'>
            {t("modOrdering.noMods")}
          </div>
        ) : (
          <>
            <div className='flex shrink-0 items-center gap-3'>
              <SearchInput
                placeholder={t("modOrdering.searchPlaceholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onClear={() => setSearch("")}
              />
              <span className='shrink-0 text-muted-foreground text-xs tabular-nums'>
                {query
                  ? t("modOrdering.matchCount", {
                      count: visibleMods.length,
                      total: orderedMods.length,
                    })
                  : t("modOrdering.modCount", { count: orderedMods.length })}
              </span>
            </div>
            {query && (
              <p className='-mt-1 shrink-0 text-muted-foreground text-xs'>
                {t("modOrdering.searchDragHint")}
              </p>
            )}

            <div className='-mx-2 min-h-0 flex-1 overflow-y-auto px-2'>
              {visibleMods.length === 0 ? (
                <p className='py-8 text-center text-muted-foreground text-sm'>
                  {t("modOrdering.noMatches")}
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragStart={handleDragStart}
                  onDragCancel={() => setActiveId(null)}
                  onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={visibleMods.map((mod) => mod.remoteId)}
                    strategy={verticalListSortingStrategy}>
                    <ol className='space-y-0.5'>
                      {visibleMods.map((mod) => {
                        const index = orderedMods.indexOf(mod);
                        return (
                          <SortableModRow
                            key={mod.remoteId}
                            mod={mod}
                            position={index + 1}
                            total={orderedMods.length}
                            moved={initialPositions.get(mod.remoteId) !== index}
                            dragDisabled={!!query}
                            files={fileOrders.get(mod.remoteId)}
                            filesChanged={changedFileMods.includes(
                              mod.remoteId,
                            )}
                            expanded={expanded.has(mod.remoteId)}
                            onToggleExpanded={() =>
                              toggleExpanded(mod.remoteId)
                            }
                            onMove={(to) => moveMod(mod.remoteId, to)}
                            onFilesChange={(files) =>
                              setFileOrders((current) =>
                                new Map(current).set(mod.remoteId, files),
                              )
                            }
                          />
                        );
                      })}
                    </ol>
                  </SortableContext>
                  <DragOverlay dropAnimation={null}>
                    {activeMod && (
                      <DragPreview mod={activeMod} position={activeIndex + 1} />
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </>
        )}

        <DialogFooter className='flex shrink-0 items-center gap-2 border-t pt-3 sm:justify-between'>
          <div className='flex items-center gap-2'>
            <Button
              disabled={!isDirty || isLoading}
              icon={<Undo2 className='h-3.5 w-3.5' />}
              onClick={discardChanges}
              size='sm'
              variant='ghost'>
              {t("modOrdering.discardChanges")}
            </Button>
            {isDirty && (
              <span className='text-muted-foreground text-xs'>
                {t("modOrdering.unsavedChanges")}
              </span>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              onClick={() => setOpen(false)}
              disabled={isLoading}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => saveOrderMutation.mutate()}
              disabled={isLoading || !isDirty}
              icon={<Save className='h-4 w-4' />}
              isLoading={isLoading}>
              {t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
