import type { Modifier } from "@dnd-kit/core";
import { hasViewportRelativeCoordinates } from "@dnd-kit/utilities";

export const anchorLibraryDragPreview: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  if (
    !activatorEvent ||
    !hasViewportRelativeCoordinates(activatorEvent) ||
    !draggingNodeRect
  ) {
    return transform;
  }
  return {
    ...transform,
    x: transform.x + activatorEvent.clientX - draggingNodeRect.left + 12,
    y: transform.y + activatorEvent.clientY - draggingNodeRect.top + 12,
  };
};

export const libraryDragPreviewModifiers = [anchorLibraryDragPreview];
