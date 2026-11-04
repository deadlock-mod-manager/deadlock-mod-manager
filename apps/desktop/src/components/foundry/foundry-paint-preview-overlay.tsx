import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { useFoundry } from "./foundry-context";
import { type PaintBrush } from "./use-paint-brush";
import { useSelectionTitle } from "./foundry-paint-brush-panel";

const blockerHints = {
  pattern: "foundry.paint.previewUnavailable",
  noTextures: "foundry.paint.previewNoTextures",
  applied: "foundry.paint.previewAlreadyApplied",
} as const;

/** The live-preview switch over the viewport, and the compare hint above the dock. */
export const PreviewOverlay = ({ brush }: { brush: PaintBrush }) => {
  const { t } = useTranslation();
  // The hint would sit on the loading card until the hero is on screen.
  const { viewerReady } = useFoundry();
  const title = useSelectionTitle();
  if (brush.nothingSelected) return null;

  return (
    <>
      <div className='pointer-events-none absolute inset-x-0 top-[62px] flex justify-center'>
        <Tooltip>
          <TooltipTrigger asChild>
            <label className='pointer-events-auto flex items-center gap-2.5 rounded-full border bg-card/90 py-1.5 pr-2 pl-3 text-xs backdrop-blur-md'>
              <span
                className={cn(
                  "h-[7px] w-[7px] rounded-full",
                  brush.showTint ? "bg-orange-400" : "bg-muted-foreground/50",
                )}
              />
              <span className='max-w-64 truncate font-medium'>
                {brush.patterned
                  ? t("foundry.paint.previewUnavailableShort")
                  : t("foundry.paint.previewOn", { target: title })}
              </span>
              <Switch
                checked={brush.previewEnabled && brush.canPreview}
                disabled={!brush.canPreview}
                onCheckedChange={brush.setPreviewEnabled}
              />
            </label>
          </TooltipTrigger>
          <TooltipContent side='bottom' className='max-w-72'>
            {t(
              brush.previewBlocker
                ? blockerHints[brush.previewBlocker]
                : "foundry.paint.previewHint",
            )}
          </TooltipContent>
        </Tooltip>
      </div>
      {brush.tinting && viewerReady && (
        <div className='pointer-events-none absolute inset-x-0 bottom-[124px] flex justify-center'>
          <p className='flex items-center gap-2 rounded-[7px] border bg-card/90 py-[5px] pr-2.5 pl-1.5 text-[11px] text-muted-foreground backdrop-blur-md'>
            <kbd className='rounded border border-white/10 bg-muted px-[7px] py-0.5 font-mono font-semibold text-[10px] text-foreground'>
              {t("foundry.paint.spaceKey")}
            </kbd>
            {t("foundry.paint.compare")}
          </p>
        </div>
      )}
    </>
  );
};
