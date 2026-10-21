import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useTranslation } from "react-i18next";

export const OutdatedConvarBadge = () => {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className='border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
          tabIndex={0}
          variant='outline'>
          {t("settings.outdatedConvarBadge")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("settings.outdatedConvarTooltip")}</p>
      </TooltipContent>
    </Tooltip>
  );
};
