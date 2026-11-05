import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Folder } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { ModSourceGlyph } from "./mod-source-glyph";

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
  if (!source && !local) return null;

  const name = source?.sourceName ?? t("modSources.localFiles");
  const host = source?.acceptedOrigin;
  const sourceLabel = t("modSources.sourceLabel", { name });
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
          ) : (
            <ModSourceGlyph iconUrl={source?.iconUrl} />
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
