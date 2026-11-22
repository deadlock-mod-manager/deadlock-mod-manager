import { cn } from "@deadlock-mods/ui/lib/utils";
import { FoundryPreview } from "./foundry-preview";
import { usePaintBrush } from "./use-paint-brush";
import { PaintRail } from "./foundry-paint-rail";
import { PreviewOverlay } from "./foundry-paint-preview-overlay";
import { BrushPanel } from "./foundry-paint-brush-panel";

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
