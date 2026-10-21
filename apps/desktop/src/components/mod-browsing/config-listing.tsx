import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { GaugeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useOpenConfigInPerformance } from "@/hooks/performance/use-config-listing";
import type { ConfigListing } from "@/lib/performance/config-listing";

/** Takes Install's place for a GameBanana upload that is a performance config. */
export const OpenInPerformanceButton = ({
  remoteId,
  variant,
}: {
  remoteId: string;
  variant: "iconOnly" | "default";
}) => {
  const { t } = useTranslation();
  const open = useOpenConfigInPerformance();
  const label = t("configListing.open");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          icon={<GaugeIcon className='h-4 w-4' />}
          isLoading={open.isPending}
          onClick={(event) => {
            event.stopPropagation();
            open.mutate(remoteId);
          }}
          size={variant === "iconOnly" ? "icon" : "default"}
          variant={variant === "iconOnly" ? "outline" : "default"}>
          {variant === "iconOnly" ? null : label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className='max-w-xs'>{t("configListing.tooltip")}</p>
      </TooltipContent>
    </Tooltip>
  );
};

/** Explains on the mod page why a config isn't installed like a mod. */
export const ConfigListingNotice = ({
  listing,
  remoteId,
}: {
  listing: ConfigListing;
  remoteId: string;
}) => {
  const { t } = useTranslation();
  const open = useOpenConfigInPerformance();

  return (
    <Alert>
      <GaugeIcon className='h-4 w-4' />
      <AlertDescription className='flex items-center gap-4'>
        <span className='min-w-0 flex-1'>
          {listing === "confirmed"
            ? t("configListing.confirmed")
            : t("configListing.likely")}
        </span>
        <Button
          className='shrink-0'
          isLoading={open.isPending}
          onClick={() => open.mutate(remoteId)}
          size='sm'
          variant='outline'>
          {t("configListing.open")}
        </Button>
      </AlertDescription>
    </Alert>
  );
};
