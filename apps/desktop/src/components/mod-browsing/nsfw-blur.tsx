import { Badge } from "@deadlock-mods/ui/components/badge";
import { Eye, EyeOff } from "@deadlock-mods/ui/icons";
import { platform } from "@tauri-apps/plugin-os";
import { isValidElement, useEffect, useRef, useState } from "react";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const NSFWBadge = ({ className }: { className?: string }) => (
  <Badge
    className={cn(
      "border-red-500/30 bg-red-950/80 font-bold uppercase tracking-widest text-red-300",
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

const BLUR_RADIUS = 4;

const boxBlurPass = (source: HTMLCanvasElement, dx: number, dy: number) => {
  const target = document.createElement("canvas");
  target.width = source.width;
  target.height = source.height;
  const ctx = target.getContext("2d");
  if (!ctx) {
    return source;
  }

  ctx.drawImage(source, 0, 0);
  for (let offset = -BLUR_RADIUS; offset <= BLUR_RADIUS; offset++) {
    ctx.globalAlpha = 1 / (offset + BLUR_RADIUS + 2);
    ctx.drawImage(source, offset * dx, offset * dy);
  }
  return target;
};

const drawBlurred = (
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  blurStrength: number,
) => {
  const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
  if (!naturalWidth || !clientWidth || !clientHeight) {
    return;
  }

  const style = getComputedStyle(img);
  const fit = style.objectFit === "contain" ? Math.min : Math.max;
  const scale =
    (fit(clientWidth / naturalWidth, clientHeight / naturalHeight) *
      BLUR_RADIUS) /
    Math.max(blurStrength, BLUR_RADIUS);

  let blurred = document.createElement("canvas");
  blurred.width = Math.max(1, Math.round(naturalWidth * scale));
  blurred.height = Math.max(1, Math.round(naturalHeight * scale));
  const ctx = blurred.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, blurred.width, blurred.height);

  for (let pass = 0; pass < 2; pass++) {
    blurred = boxBlurPass(boxBlurPass(blurred, 1, 0), 0, 1);
  }

  canvas.width = blurred.width;
  canvas.height = blurred.height;
  canvas.style.objectFit = style.objectFit;
  canvas.style.objectPosition = style.objectPosition;
  canvas.getContext("2d")?.drawImage(blurred, 0, 0);
};

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
  const [previousIsNSFW, setPreviousIsNSFW] = useState(isNSFW);
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const linuxCanvasNSFWBlur = usePersistedStore(
    (state) => state.linuxCanvasNSFWBlur,
  );
  const canvasBlur =
    linuxCanvasNSFWBlur &&
    platform() === "linux" &&
    isValidElement(children) &&
    children.type === "img";
  const blurWithCanvas = canvasBlur && isNSFW && !disableBlur && !isVisible;

  if (previousIsNSFW !== isNSFW) {
    setPreviousIsNSFW(isNSFW);
    setIsVisible(false);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = contentRef.current?.querySelector("img");
    if (!blurWithCanvas || !canvas || !img) {
      return;
    }

    const draw = () => drawBlurred(canvas, img, blurStrength);
    draw();
    img.addEventListener("load", draw);
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(img);

    return () => {
      img.removeEventListener("load", draw);
      resizeObserver.disconnect();
    };
  }, [blurWithCanvas, blurStrength]);

  if (!isNSFW || disableBlur) {
    return <div className={className}>{children}</div>;
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);
    onToggleVisibility?.(newVisibility);
  };

  return (
    <div className={`relative ${className}`}>
      <div
        className={cn(
          "h-full w-full",
          !isVisible &&
            (canvasBlur ? "invisible" : "will-change-[filter] [contain:paint]"),
        )}
        ref={contentRef}
        style={
          !isVisible && !canvasBlur
            ? { filter: `blur(${blurStrength}px)` }
            : undefined
        }>
        {children}
      </div>

      {blurWithCanvas && (
        <canvas
          aria-hidden
          className='absolute inset-0 h-full w-full'
          ref={canvasRef}
        />
      )}

      {!isVisible && (
        <div className='absolute inset-0 flex items-center justify-center bg-black/40'>
          <div className='flex flex-col items-center gap-3'>
            <NSFWBadge className='px-3 py-1 text-xs' />
            {showControls && (
              <button
                type='button'
                className={cn(
                  "group flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80 transition-all duration-300 hover:border-white/30 hover:bg-white/15 hover:text-white hover:shadow-[0_0_16px_rgba(255,255,255,0.08)]",
                  !canvasBlur && "backdrop-blur-xl",
                )}
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
            className={cn(
              "group flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs font-medium text-white/70 transition-all duration-300 hover:border-white/25 hover:bg-black/70 hover:text-white",
              !canvasBlur && "backdrop-blur-xl",
            )}
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
