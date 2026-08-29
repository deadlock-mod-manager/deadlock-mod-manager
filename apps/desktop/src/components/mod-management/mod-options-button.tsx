import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Settings } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ModOptionsButtonProps {
  activeCount: number;
  onOpen: () => void;
  className?: string;
}

export const ModOptionsButton = ({
  activeCount,
  onOpen,
  className,
}: ModOptionsButtonProps) => {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          aria-label={t("modOptions.openTooltip")}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={cn(
            "flex items-center gap-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            className,
          )}>
          <Settings className='h-3.5 w-3.5' />
          {activeCount > 0 && (
            <span className='font-medium text-xs tabular-nums leading-none'>
              {activeCount}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {activeCount > 0
          ? t("modOptions.openTooltipWithCount", { count: activeCount })
          : t("modOptions.openTooltip")}
      </TooltipContent>
    </Tooltip>
  );
};
