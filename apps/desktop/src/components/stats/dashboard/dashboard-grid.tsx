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
} from "@dnd-kit/sortable";
import { Plus } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useElementWidth } from "@/hooks/use-element-width";
import {
  type DashboardTab,
  GRID_COLUMNS,
  ROW_HEIGHT_PX,
} from "@/lib/stats/dashboard/layout";
import { type WidgetHealth } from "./dashboard-widget";
import { useWidgetTitle } from "./use-widget-title";
import { GAP_PX, TRACK_PX, responsiveSpan } from "./dashboard-grid-layout";
import { type GridActions } from "./grid-actions";
import { GridItem } from "./grid-item";

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);
    if (event.over && event.active.id !== event.over.id) {
      actions.onReorder(String(event.active.id), String(event.over.id));
    }
  };

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
