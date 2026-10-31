import { cn } from "@deadlock-mods/ui/lib/utils";
import { FoundryPreview } from "./foundry-preview";
import { usePaintBrush } from "./use-paint-brush";
import { PaintRail } from "./foundry-paint-rail";
import { PreviewOverlay } from "./foundry-paint-preview-overlay";
import { BrushPanel } from "./foundry-paint-brush-panel";

/**
 * The paint tab: sections on the left, the hero in the middle, the brush on
 * the right. A section is one color map, so painting it rewrites exactly that
 * map; a whole part repaints every texture it covers, and for abilities the
 * particle colors too.
 *
 * The preview tints live as the color changes, which is instant but
 * approximate; Paint bakes the real thing into the workspace and the preview
 * then re-reads the actual textures.
 */
export const FoundryPaintWorkspace = ({
  sidePanelClassName,
}: {
  sidePanelClassName: string;
}) => {
  const brush = usePaintBrush();
  return (
    <>
      <div className={cn(sidePanelClassName, "w-[248px] border-r")}>
        <PaintRail brush={brush} />
      </div>
      <div className='relative min-w-0 flex-1'>
        <FoundryPreview />
        <PreviewOverlay brush={brush} />
      </div>
      <div className={cn(sidePanelClassName, "w-[292px] border-l")}>
        <BrushPanel brush={brush} />
      </div>
    </>
  );
};
