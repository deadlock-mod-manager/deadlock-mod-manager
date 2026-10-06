import { Toggle } from "@deadlock-mods/ui/components/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { CloudDownload } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useMatchSync } from "@/hooks/use-match-sync";
import { useMatchSyncToggle } from "@/hooks/use-match-sync-toggle";
import { cn } from "@/lib/utils";

/**
 * Match sync is what keeps this page current, so it can be flipped right here
 * instead of a trip to Settings. The consent dialog still guards turning it on,
 * and the full controls (quota, full sync) stay in the privacy tab.
 */
export const MatchSyncToggle = () => {
  const { t } = useTranslation();
  const { status, setConsent, setEnabled } = useMatchSync();
  const handleEnableChange = useMatchSyncToggle({
    status,
    setConsent,
    setEnabled,
  });
  const enabled = status?.enabled ?? false;

  return (
    <Tooltip>
      {/* The trigger has to sit on something enabled, or the explanation never
          shows while the status loads. */}
      <TooltipTrigger asChild>
        <span className='inline-flex'>
          <Toggle
            aria-label={t("stats.settings.matchSync")}
            className={cn(
              "h-8 gap-2 rounded-md border border-border/60 bg-background/40 px-3",
              "font-medium text-muted-foreground text-xs",
              "hover:bg-background/80 hover:text-foreground",
              "data-[state=on]:border-primary/50 data-[state=on]:bg-primary/15",
              "data-[state=on]:text-primary data-[state=on]:shadow-[inset_0_-1px_0_var(--color-primary)]",
            )}
            disabled={!status || setEnabled.isPending || setConsent.isPending}
            onPressedChange={handleEnableChange}
            pressed={enabled}>
            <CloudDownload className='h-4 w-4' />
            <span>{t("stats.settings.matchSync")}</span>
          </Toggle>
        </span>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs space-y-1'>
        <p>{t("matchSync.description")}</p>
        <p>{t("matchSync.about.summary")}</p>
      </TooltipContent>
    </Tooltip>
  );
};
