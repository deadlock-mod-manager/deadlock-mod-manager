import { useDraggable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const DraggableLibraryMod = ({
  id,
  disabled,
  children,
  className,
}: {
  id: string;
  disabled: boolean;
  children: ReactNode;
  className?: string;
}) => {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      data-library-mod={id}
      className={cn(
        className,
        !disabled && "cursor-grab",
        isDragging && "opacity-40",
      )}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (
          event.target instanceof Element &&
          !event.target.closest("[data-library-selection-surface]") &&
          event.target.closest(
            "button, a, input, select, textarea, [role='button'], [role='checkbox'], [role='switch'], [contenteditable='true']",
          )
        ) {
          return;
        }
        listeners?.onPointerDown?.(event);
      }}>
      {children}
    </div>
  );
};
