import { Badge } from "@deadlock-mods/ui/components/badge";
import { Eye, EyeOff } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const NSFWBadge = ({ className }: { className?: string }) => (
  <Badge
    className={cn("font-semibold uppercase tracking-wide shadow-md", className)}
    variant='destructive'>
    NSFW
  </Badge>
);

type NSFWBlurProps = {
  children: React.ReactNode;
  isNSFW: boolean;
  blurStrength?: number;
  showControls?: boolean;
  onToggleVisibility?: (visible: boolean) => void;
  className?: string;
  disableBlur?: boolean;
};

/**
 * Wrapper component that applies blur effect to NSFW content
 * with toggle controls for showing/hiding the content
 */
export const NSFWBlur = ({
  children,
  isNSFW,
  blurStrength = 16,
  showControls = true,
  onToggleVisibility,
  className = "",
  disableBlur = false,
}: NSFWBlurProps) => {
  const [isVisible, setIsVisible] = useState(false);

  if (!isNSFW || disableBlur) {
    return <div className={className}>{children}</div>;
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event from bubbling up to parent elements
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);
    onToggleVisibility?.(newVisibility);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Blurred content — will-change:filter promotes to GPU layer so
          the blur is rasterised once and cached, not recalculated every frame.
          contain:paint clips/isolates paint without size containment (strict would collapse layout). */}
      <div
        className={cn(
          "h-full w-full",
          !isVisible && "will-change-[filter] [contain:paint]",
        )}
        style={!isVisible ? { filter: `blur(${blurStrength}px)` } : undefined}>
        {children}
      </div>

      {!isVisible && (
        <div className='absolute inset-0 flex items-center justify-center bg-black/30'>
          <div className='flex flex-col items-center gap-3'>
            <NSFWBadge className='px-2.5 py-1 text-xs' />
            {showControls && (
              <button
                type='button'
                className='group flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition-all duration-200 hover:border-white/35 hover:bg-white/20 hover:text-white hover:shadow-[0_0_12px_rgba(255,255,255,0.1)]'
                onClick={handleToggle}>
                <Eye className='h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110' />
                Show
              </button>
            )}
          </div>
        </div>
      )}

      {isVisible && showControls && (
        <div className='absolute top-2 right-2'>
          <button
            type='button'
            className='group flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-black/60 hover:text-white'
            onClick={handleToggle}>
            <EyeOff className='h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110' />
            Hide
          </button>
        </div>
      )}
    </div>
  );
};

export default NSFWBlur;
