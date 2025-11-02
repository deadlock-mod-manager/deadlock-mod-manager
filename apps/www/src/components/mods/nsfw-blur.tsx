import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { useState } from "react";
import { LuEye, LuEyeOff } from "react-icons/lu";

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
    e.stopPropagation();
    e.preventDefault();
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);
    onToggleVisibility?.(newVisibility);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Blurred content */}
      <div
        className={isVisible ? "" : "transition-all duration-200"}
        style={{
          filter: isVisible ? "none" : `blur(${blurStrength}px)`,
        }}>
        {children}
      </div>

      {/* NSFW badge and controls overlay */}
      {!isVisible && (
        <div className='absolute inset-0 flex items-center justify-center bg-black/20'>
          <div className='flex flex-col items-center gap-2'>
            <Badge className='px-2 py-1' variant='destructive'>
              NSFW
            </Badge>
            {showControls && (
              <Button
                className='text-xs'
                onClick={handleToggle}
                size='sm'
                variant='secondary'>
                <LuEye className='mr-1 h-3 w-3' />
                Show
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Hide button when visible */}
      {isVisible && showControls && (
        <div className='absolute top-2 right-2'>
          <Button
            className='text-xs'
            onClick={handleToggle}
            size='sm'
            variant='secondary'>
            <LuEyeOff className='mr-1 h-3 w-3' />
            Hide
          </Button>
        </div>
      )}
    </div>
  );
};

export default NSFWBlur;
