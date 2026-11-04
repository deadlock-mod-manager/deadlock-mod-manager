import { useSortable } from "@dnd-kit/sortable";
import { Button } from "@deadlock-mods/ui/components/button";
import { GripVertical, Pencil } from "@deadlock-mods/ui/icons";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  GRID_COLUMNS,
  MAX_ROWS,
  MIN_ROWS,
  ROW_HEIGHT_PX,
} from "@/lib/stats/dashboard/layout";
import { cn } from "@/lib/utils";
import { WidgetContent, type WidgetHealth } from "./dashboard-widget";
import { GAP_PX, TRACK_PX, responsiveSpan } from "./dashboard-grid-layout";
import { type WidgetMenuProps, WidgetMenu } from "./widget-menu";

interface GridItemProps extends WidgetMenuProps {
  editing: boolean;
  gridWidth: number;
  isDropTarget: boolean;
  onHealth: (widgetId: string, health: WidgetHealth) => void;
}

export const GridItem = ({
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
    // A narrow window renders a responsive span instead of the stored width,
    // so a resize there only touches the height.
    const widthLocked = responsiveSpan(widget.w, gridWidth) !== widget.w;
    setResizing(true);

    const onMove = (move: PointerEvent) => {
      const w = widthLocked
        ? widget.w
        : Math.round(
            (start.width + move.clientX - start.x + GAP_PX) /
              (columnPx + GAP_PX),
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
      data-widget-width={widget.w}
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
              {widget.w} × {widget.h ?? t("stats.dashboard.editor.heightAuto")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
