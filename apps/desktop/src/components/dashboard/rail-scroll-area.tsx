import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 5;

type DragState = {
  startX: number;
  startScrollLeft: number;
  dragging: boolean;
};

type Props = {
  scrollerRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
};

// Stops the webview's native drag from picking up card images.
const onDragStart = (event: ReactDragEvent<HTMLElement>) => {
  event.preventDefault();
};

const useDragScroll = (scrollerRef: RefObject<HTMLElement | null>) => {
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const scroller = scrollerRef.current;
    // Touch and pen already scroll natively.
    if (!scroller || event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }
    drag.current = {
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      dragging: false,
    };
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state?.dragging) return;
    delete event.currentTarget.dataset.dragging;
    // The click that ends a drag is dispatched before this timeout runs.
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    const scroller = scrollerRef.current;
    if (!state || !scroller) return;
    // A release outside the row before the drag captured the pointer never reached it.
    if (event.buttons !== 1) {
      endDrag(event);
      return;
    }
    const dx = event.clientX - state.startX;
    if (!state.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      // Capturing on press would steal the click from the card underneath.
      event.currentTarget.setPointerCapture(event.pointerId);
      state.dragging = true;
      event.currentTarget.dataset.dragging = "true";
    }
    scroller.scrollLeft = state.startScrollLeft - dx;
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onClickCapture,
    onDragStart,
  };
};

export const RailScrollArea = ({ scrollerRef, className, children }: Props) => {
  const dragScrollHandlers = useDragScroll(scrollerRef);

  return (
    <ScrollArea
      className='-mx-1'
      orientation='horizontal'
      // Radix positions the bar inline, so the inset needs `!` to win. The
      // padding keeps a tall hit area around a 3px line.
      scrollBarClassName='!left-[20%] !right-[20%] h-3 cursor-pointer rounded-full border-t-0 bg-white/[0.06] bg-clip-content p-0 py-[4.5px] transition-[padding] duration-150 hover:py-[3px] [&>div]:bg-primary/50 hover:[&>div]:bg-primary/70'
      type='auto'
      viewportRef={scrollerRef}>
      <div
        className={cn(
          "flex w-max select-none px-1 pb-7 data-[dragging=true]:cursor-grabbing [&_img]:[-webkit-user-drag:none]",
          className,
        )}
        {...dragScrollHandlers}>
        {children}
      </div>
    </ScrollArea>
  );
};
