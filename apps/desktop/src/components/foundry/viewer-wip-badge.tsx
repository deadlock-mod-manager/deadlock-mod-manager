import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { overlaySurface } from "./viewer-tool-types";

/** Stays on screen after loading so nobody mistakes the preview for the game. */
export const ViewerWipBadge = () => {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={t("modelPreview.disclaimerTitle")}
          className={cn(
            overlaySurface,
            "flex h-8 shrink-0 cursor-default items-center whitespace-nowrap rounded-md px-2 font-medium text-xs",
          )}>
          {t("modelPreview.wipBadge")}
        </span>
      </TooltipTrigger>
      <TooltipContent side='bottom' className='max-w-72'>
        <p className='font-medium'>{t("modelPreview.disclaimerTitle")}</p>
        <p className='mt-1 text-white/70'>{t("modelPreview.disclaimer")}</p>
      </TooltipContent>
    </Tooltip>
  );
};
