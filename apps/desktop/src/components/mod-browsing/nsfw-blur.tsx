import { Badge } from "@deadlock-mods/ui/components/badge";
import { Eye, EyeOff } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const NSFWBadge = ({ className }: { className?: string }) => (
  <Badge
    className={cn(
      "border-red-500/30 bg-red-950/80 font-bold uppercase tracking-widest text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.25)]",
      className,
    )}
    variant='outline'>
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
        <div className='absolute inset-0 flex items-center justify-center bg-black/40'>
          <div className='flex flex-col items-center gap-3'>
            <NSFWBadge className='px-3 py-1 text-xs' />
            {showControls && (
              <button
                type='button'
                className='group flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-xl transition-all duration-300 hover:border-white/30 hover:bg-white/15 hover:text-white hover:shadow-[0_0_16px_rgba(255,255,255,0.08)]'
                onClick={handleToggle}>
                <Eye className='h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-110' />
                Show
              </button>
            )}
          </div>
        </div>
      )}

      {isVisible && showControls && (
        <div className='absolute top-2 left-2'>
          <button
            type='button'
            className='group flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-xl transition-all duration-300 hover:border-white/25 hover:bg-black/70 hover:text-white'
            onClick={handleToggle}>
            <EyeOff className='h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-110' />
            Hide
          </button>
        </div>
      )}
    </div>
  );
};

export default NSFWBlur;
