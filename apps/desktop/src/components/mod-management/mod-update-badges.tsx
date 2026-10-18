import type { ModDto } from "@deadlock-mods/shared";
import { usePersistedStore } from "@/lib/store";
import { isUpdatedRecently } from "@/lib/utils";
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

function UpdatedRecentlyBadge({
  className,
}: Readonly<UpdatedRecentlyBadgeProps>) {
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

function UpdateAvailableBadge({
  className,
}: Readonly<UpdateAvailableBadgeProps>) {
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

type ModUpdateBadgeProps = {
  mod: ModDto;
  hasUpdate: boolean;
  className?: string;
};

export function ModUpdateBadge({
  mod,
  hasUpdate,
  className,
}: Readonly<ModUpdateBadgeProps>) {
  const showModUpdateBadges = usePersistedStore(
    (state) => state.showModUpdateBadges,
  );
  if (!showModUpdateBadges) return null;
  if (hasUpdate) return <UpdateAvailableBadge className={className} />;
  return isUpdatedRecently(mod) ? (
    <UpdatedRecentlyBadge className={className} />
  ) : null;
}
