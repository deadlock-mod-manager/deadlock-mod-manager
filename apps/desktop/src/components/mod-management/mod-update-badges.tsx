import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ArrowDownCircle, Sparkles } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

type UpdatedRecentlyBadgeProps = {
  className?: string;
};

export function UpdatedRecentlyBadge({ className }: UpdatedRecentlyBadgeProps) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={`cursor-help ${className ?? ""}`} variant='secondary'>
          <Sparkles className='mr-1 h-3 w-3' />
          {t("warnings.updatedRecentlyLabel")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className='max-w-xs'>{t("warnings.updatedRecentlyDescription")}</p>
      </TooltipContent>
    </Tooltip>
  );
}

type UpdateAvailableBadgeProps = {
  className?: string;
};

export function UpdateAvailableBadge({ className }: UpdateAvailableBadgeProps) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={`cursor-help ${className ?? ""}`} variant='default'>
          <ArrowDownCircle className='mr-1 h-3 w-3' />
          {t("warnings.updateAvailableLabel")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className='max-w-xs'>{t("warnings.updateAvailableDescription")}</p>
      </TooltipContent>
    </Tooltip>
  );
}
