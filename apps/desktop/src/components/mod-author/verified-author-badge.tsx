import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { SealCheckIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { CommissionAvailability } from "@/hooks/use-commission-author";

interface VerifiedAuthorBadgeProps {
  availability: CommissionAvailability;
}

export const VerifiedAuthorBadge = ({
  availability,
}: VerifiedAuthorBadgeProps) => {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={t("authorPage.verifiedLabel")}
          className='verified-seal relative inline-flex shrink-0 text-primary'
          role='img'
          tabIndex={0}>
          <SealCheckIcon className='h-7 w-7' weight='fill' />
        </span>
      </TooltipTrigger>
      <TooltipContent className='max-w-80'>
        <p className='font-medium'>{t("authorPage.verifiedLabel")}</p>
        <p className='text-muted-foreground text-xs'>
          {t(`authorPage.verifiedAvailability.${availability}`)}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};

/** Inline seal for places that are already a button, so no tooltip. */
export const VerifiedSeal = () => {
  const { t } = useTranslation();
  return (
    <SealCheckIcon
      aria-label={t("authorPage.verifiedLabel")}
      className='h-4 w-4 shrink-0 text-primary'
      role='img'
      weight='fill'
    />
  );
};
