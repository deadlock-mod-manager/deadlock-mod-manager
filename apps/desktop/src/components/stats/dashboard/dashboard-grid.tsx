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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  ArrowLeft,
  ArrowRight,
  Columns3,
  Copy,
  FolderInput,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "@deadlock-mods/ui/icons";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  type DashboardTab,
  type DashboardWidget,
  GRID_COLUMNS,
  MAX_ROWS,
  MIN_ROWS,
  ROW_HEIGHT_PX,
} from "@/lib/stats/dashboard/layout";
import { cn } from "@/lib/utils";
import { WidgetContent, type WidgetHealth } from "./dashboard-widget";
import { useTabTitle } from "./use-tab-title";
import { useWidgetTitle } from "./use-widget-title";

/** Column gap, and the bottom padding every item carries in place of a row gap. */
const GAP_PX = 16;
/**
 * Fine row track the items span. Auto-height widgets measure themselves and
 * span as many tracks as they need, which packs them masonry-style without a
 * layout engine; fixed heights are multiples of ROW_HEIGHT_PX, which this divides.
 */
const TRACK_PX = 8;
const WIDTH_PRESETS = [3, 4, 6, 8, 12] as const;

/** Narrow windows widen small widgets instead of squeezing them into slivers. */
const responsiveSpan = (w: number, gridWidth: number) => {
  if (gridWidth < 640) {
    return GRID_COLUMNS;
  }
  if (gridWidth < 960) {
    return Math.min(GRID_COLUMNS, Math.max(w, 6));
  }
  return w;
};

const useElementWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry?.contentRect.width ?? 0),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
};

export interface GridActions {
  onEdit: (widget: DashboardWidget) => void;
  onRemove: (widgetId: string) => void;
  onDuplicate: (widgetId: string) => void;
  onResize: (widgetId: string, size: Pick<DashboardWidget, "w" | "h">) => void;
  onReorder: (widgetId: string, targetId: string) => void;
  onMoveToTab: (widgetId: string, tabId: string) => void;
}

interface WidgetMenuProps {
  widget: DashboardWidget;
  index: number;
  siblings: DashboardWidget[];
  tabs: DashboardTab[];
  currentTabId: string;
  actions: GridActions;
}

const WidgetMenu = ({
  widget,
  index,
  siblings,
  tabs,
  currentTabId,
  actions,
}: WidgetMenuProps) => {
  const { t } = useTranslation();
  const tabTitle = useTabTitle();
  const previous = siblings[index - 1];
  const next = siblings[index + 1];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("stats.dashboard.widget.menu")}
          className='h-7 w-7'
          size='icon'
          variant='ghost'>
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuItem onSelect={() => actions.onEdit(widget)}>
          <Pencil className='h-4 w-4' />
          {t("stats.dashboard.widget.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onDuplicate(widget.id)}>
          <Copy className='h-4 w-4' />
          {t("stats.dashboard.widget.duplicate")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Columns3 className='h-4 w-4' />
            {t("stats.dashboard.widget.width")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {WIDTH_PRESETS.map((width) => (
              <DropdownMenuItem
                key={width}
                onSelect={() =>
                  actions.onResize(widget.id, { w: width, h: widget.h })
                }>
                {t(`stats.dashboard.widths.${width}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {tabs.length > 1 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className='h-4 w-4' />
              {t("stats.dashboard.widget.moveToTab")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {tabs
                .filter((tab) => tab.id !== currentTabId)
                .map((tab) => (
                  <DropdownMenuItem
                    key={tab.id}
                    onSelect={() => actions.onMoveToTab(widget.id, tab.id)}>
                    {tabTitle(tab)}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem
          disabled={!previous}
          onSelect={() =>
            previous && actions.onReorder(widget.id, previous.id)
          }>
          <ArrowLeft className='h-4 w-4' />
          {t("stats.dashboard.widget.moveEarlier")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!next}
          onSelect={() => next && actions.onReorder(widget.id, next.id)}>
          <ArrowRight className='h-4 w-4' />
          {t("stats.dashboard.widget.moveLater")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='text-destructive focus:text-destructive'
          onSelect={() => actions.onRemove(widget.id)}>
          <Trash2 className='h-4 w-4' />
          {t("stats.dashboard.widget.remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface GridItemProps extends Omit<WidgetMenuProps, "index"> {
  index: number;
  editing: boolean;
  gridWidth: number;
  isDropTarget: boolean;
  onHealth: (widgetId: string, health: WidgetHealth) => void;
}

const GridItem = ({
  widget,
  index,
  siblings,
  tabs,
  currentTabId,
  actions,
  editing,
  gridWidth,
  isDropTarget,
  onHealth,
}: GridItemProps) => {
  const { t } = useTranslation();
  const measureRef = useRef<HTMLDivElement>(null);
  const [tracks, setTracks] = useState(
    widget.h === null ? 1 : (widget.h * ROW_HEIGHT_PX) / TRACK_PX,
  );
  const [resizing, setResizing] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: widget.id,
    disabled: !editing,
  });

  useEffect(() => {
    const element = measureRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setTracks(Math.max(1, Math.ceil(element.offsetHeight / TRACK_PX))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const item = measureRef.current;
    if (!item || gridWidth === 0) {
      return;
    }
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const columnPx = (gridWidth - GAP_PX * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    const start = {
      x: event.clientX,
      y: event.clientY,
      width: item.offsetWidth,
      height: item.offsetHeight,
    };
    setResizing(true);

    const onMove = (move: PointerEvent) => {
      const w = Math.round(
        (start.width + move.clientX - start.x + GAP_PX) / (columnPx + GAP_PX),
      );
      const h = Math.round(
        (start.height + move.clientY - start.y) / ROW_HEIGHT_PX,
      );
      actions.onResize(widget.id, {
        w: Math.min(GRID_COLUMNS, Math.max(1, w)),
        h: Math.min(MAX_ROWS, Math.max(MIN_ROWS, h)),
      });
    };
    const onUp = () => {
      setResizing(false);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const controls = editing ? (
    <>
      <Button
        aria-label={t("stats.dashboard.widget.drag")}
        className='h-7 w-7 cursor-grab touch-none active:cursor-grabbing'
        size='icon'
        variant='ghost'
        {...attributes}
        {...listeners}>
        <GripVertical className='h-4 w-4' />
      </Button>
      <Button
        aria-label={t("stats.dashboard.widget.edit")}
        className='h-7 w-7'
        onClick={() => actions.onEdit(widget)}
        size='icon'
        variant='ghost'>
        <Pencil className='h-3.5 w-3.5' />
      </Button>
      <WidgetMenu
        actions={actions}
        currentTabId={currentTabId}
        index={index}
        siblings={siblings}
        tabs={tabs}
        widget={widget}
      />
    </>
  ) : undefined;

  return (
    <div
      className={cn("relative min-w-0", isDragging && "opacity-40")}
      data-widget-id={widget.id}
      data-widget-source={
        widget.source.kind === "preset"
          ? widget.source.preset
          : widget.source.kind === "panel"
            ? widget.source.panel
            : widget.source.kind
      }
      ref={setNodeRef}
      style={{
        gridColumn: `span ${responsiveSpan(widget.w, gridWidth)}`,
        gridRow: `span ${tracks}`,
      }}>
      <div
        ref={measureRef}
        style={{
          paddingBottom: GAP_PX,
          height: widget.h === null ? undefined : widget.h * ROW_HEIGHT_PX,
        }}>
        <div
          className={cn(
            "relative",
            widget.h !== null && "h-full overflow-hidden",
            editing &&
              "rounded-xl outline-dashed outline-1 outline-offset-2 outline-border",
            isDropTarget && "outline-2 outline-primary",
          )}>
          <WidgetContent
            actions={controls}
            onHealth={onHealth}
            widget={widget}
          />
          {editing && (
            <button
              aria-label={t("stats.dashboard.widget.resize")}
              className='absolute right-0 bottom-0 z-10 flex h-5 w-5 cursor-nwse-resize items-end justify-end rounded-br-xl p-1 text-muted-foreground hover:text-primary'
              onPointerDown={startResize}
              title={t("stats.dashboard.widget.resize")}
              type='button'>
              <svg aria-hidden='true' className='h-3 w-3' viewBox='0 0 10 10'>
                <path
                  d='M9 1 1 9M9 5 5 9'
                  fill='none'
                  stroke='currentColor'
                  strokeLinecap='round'
                  strokeWidth='1.5'
                />
              </svg>
            </button>
          )}
          {resizing && (
            <span className='pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-md bg-primary px-2 py-0.5 font-medium text-primary-foreground text-xs tabular-nums'>
              {widget.w} × {widget.h ?? "auto"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

interface DashboardGridProps {
  tab: DashboardTab;
  tabs: DashboardTab[];
  editing: boolean;
  actions: GridActions;
  onAddWidget: () => void;
  onHealth: (widgetId: string, health: WidgetHealth) => void;
}

export const DashboardGrid = ({
  tab,
  tabs,
  editing,
  actions,
  onAddWidget,
  onHealth,
}: DashboardGridProps) => {
  const { t } = useTranslation();
  const titleOf = useWidgetTitle();
  const { ref, width } = useElementWidth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setOverId(null);
      if (event.over && event.active.id !== event.over.id) {
        actions.onReorder(String(event.active.id), String(event.over.id));
      }
    },
    [actions],
  );

  const activeWidget = tab.widgets.find((widget) => widget.id === activeId);

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={() => {
        setActiveId(null);
        setOverId(null);
      }}
      onDragEnd={handleDragEnd}
      onDragOver={(event) =>
        setOverId(event.over ? String(event.over.id) : null)
      }
      onDragStart={handleDragStart}
      sensors={sensors}>
      {/* Items keep their slots while dragging; the outlined target shows where
          the dragged widget lands. Live shuffling misbehaves with mixed sizes. */}
      <SortableContext
        items={tab.widgets.map((widget) => widget.id)}
        strategy={() => null}>
        <div
          className='grid pb-8'
          ref={ref}
          style={{
            gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
            columnGap: GAP_PX,
            gridAutoRows: TRACK_PX,
          }}>
          {tab.widgets.map((widget, index) => (
            <GridItem
              actions={actions}
              currentTabId={tab.id}
              editing={editing}
              gridWidth={width}
              index={index}
              isDropTarget={
                activeId !== null &&
                overId === widget.id &&
                activeId !== widget.id
              }
              key={widget.id}
              onHealth={onHealth}
              siblings={tab.widgets}
              tabs={tabs}
              widget={widget}
            />
          ))}
          {editing && (
            <button
              className='flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary'
              onClick={onAddWidget}
              style={{
                gridColumn: `span ${responsiveSpan(4, width)}`,
                gridRow: `span ${(4 * ROW_HEIGHT_PX - GAP_PX) / TRACK_PX}`,
              }}
              type='button'>
              <Plus className='h-6 w-6' />
              <span className='font-medium text-sm'>
                {t("stats.dashboard.addWidget")}
              </span>
            </button>
          )}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeWidget && (
          <div className='rounded-xl border bg-card px-4 py-3 font-medium text-sm shadow-lg'>
            {titleOf(activeWidget)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};
