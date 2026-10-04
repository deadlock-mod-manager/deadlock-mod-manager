import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { TriangleAlert } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import type { ModConflictStatus } from "@/lib/mods/conflicts";

export const ModConflictBadge = ({
  status,
  className,
  onClick,
}: {
  status: ModConflictStatus;
  className?: string;
  onClick: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          asChild
          className={cn(
            "cursor-pointer bg-background/80 backdrop-blur-sm",
            status === "modelHidden"
              ? "border-destructive/50 text-red-300 hover:bg-destructive/20"
              : "border-amber-500/40 text-amber-400 hover:bg-amber-500/15",
            className,
          )}
          data-testid='mod-conflict-badge'
          variant='outline'>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
            type='button'>
            <TriangleAlert aria-hidden />
            {t(`conflicts.badge.${status}`)}
          </button>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t(`conflicts.badgeTooltip.${status}`)}</TooltipContent>
    </Tooltip>
  );
};
