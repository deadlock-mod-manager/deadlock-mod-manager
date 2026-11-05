"use client";

import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { attachDeferredPanelResize } from "../lib/deferred-panel-resize";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "../lib/utils";

const ResizablePanelGroup = ({
  className,
  deferResize = false,
  ref,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup> & {
  deferResize?: boolean;
}) => {
  const groupRef = useRef<ResizablePrimitive.ImperativePanelGroupHandle | null>(
    null,
  );
  const setRef = useCallback(
    (group: ResizablePrimitive.ImperativePanelGroupHandle | null) => {
      groupRef.current = group;
      const cleanup = typeof ref === "function" ? ref(group) : undefined;
      if (ref && typeof ref !== "function") ref.current = group;
      return () => {
        groupRef.current = null;
        if (typeof cleanup === "function") cleanup();
        else if (typeof ref === "function") ref(null);
        else if (ref) ref.current = null;
      };
    },
    [ref],
  );
  useEffect(() => {
    const group = groupRef.current;
    if (!deferResize || !group) return;
    return attachDeferredPanelResize(group);
  }, [deferResize]);
  return (
    <ResizablePrimitive.PanelGroup
      ref={setRef}
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
};

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "after:-translate-x-1/2 data-[panel-group-direction=vertical]:after:-translate-y-1/2 relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className,
    )}
    {...props}>
    {withHandle && (
      <div className='z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border'>
        <GripVertical className='h-2.5 w-2.5' />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
