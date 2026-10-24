"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { cn } from "../lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

// Long lists render many tooltips that are never hovered, so content mounts on
// first open and then stays mounted for its close animation.
const TooltipOpenedContext = React.createContext(true);

const Tooltip = ({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) => {
  const [hasOpened, setHasOpened] = React.useState(
    Boolean(open ?? defaultOpen),
  );
  if (open && !hasOpened) {
    setHasOpened(true);
  }
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        setHasOpened(true);
      }
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  return (
    <TooltipOpenedContext.Provider value={hasOpened}>
      <TooltipPrimitive.Root
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        open={open}
        {...props}
      />
    </TooltipOpenedContext.Provider>
  );
};

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const hasOpened = React.useContext(TooltipOpenedContext);
  if (!hasOpened) {
    return null;
  }
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn(
          "fade-in-0 zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 animate-in overflow-hidden rounded-md bg-black px-3 py-1.5 text-white text-xs data-[state=closed]:animate-out",
          className,
        )}
        ref={ref}
        sideOffset={sideOffset}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
