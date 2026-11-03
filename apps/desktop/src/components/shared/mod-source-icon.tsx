import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Folder, Globe } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isNativeSourceImage } from "@/lib/mod-sources";

interface ModSourceIconProps {
  source?: {
    sourceName: string;
    acceptedOrigin: string;
    iconUrl?: string | null;
  };
  local?: boolean;
}

export const ModSourceIcon = ({
  source,
  local = false,
}: ModSourceIconProps) => {
  const { t } = useTranslation();
  const [failedIcon, setFailedIcon] = useState<string>();
  if (!source && !local) return null;

  const name = source?.sourceName ?? t("modSources.localFiles");
  const host = source?.acceptedOrigin;
  const sourceLabel = t("modSources.sourceLabel", { name });
  const iconUrl = source?.iconUrl;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`${sourceLabel}${host ? ` · ${host}` : ""}`}
          className='inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          onClick={(event) => event.stopPropagation()}>
          {local ? (
            <Folder className='size-4' />
          ) : iconUrl &&
            isNativeSourceImage(iconUrl) &&
            failedIcon !== iconUrl ? (
            <img
              className='size-4 object-contain'
              src={iconUrl}
              alt=''
              referrerPolicy='no-referrer'
              onError={() => setFailedIcon(iconUrl)}
            />
          ) : (
            <Globe className='size-4' />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{sourceLabel}</p>
        {host && <p className='text-xs opacity-80'>{host}</p>}
      </TooltipContent>
    </Tooltip>
  );
};
