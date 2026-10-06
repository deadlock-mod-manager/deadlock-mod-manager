import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useTranslation } from "react-i18next";
import { useMatchSync } from "@/hooks/use-match-sync";
import { useMatchSyncToggle } from "@/hooks/use-match-sync-toggle";

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

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex items-center gap-2'>
          <Switch
            checked={status?.enabled ?? false}
            disabled={!status || setEnabled.isPending || setConsent.isPending}
            id='stats-match-sync'
            onCheckedChange={handleEnableChange}
          />
          <Label
            className='whitespace-nowrap text-sm'
            htmlFor='stats-match-sync'>
            {t("stats.settings.matchSync")}
          </Label>
        </div>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs space-y-1'>
        <p>{t("matchSync.description")}</p>
        <p>{t("matchSync.about.summary")}</p>
      </TooltipContent>
    </Tooltip>
  );
};
