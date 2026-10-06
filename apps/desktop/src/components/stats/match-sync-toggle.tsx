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
      {/* A real switch rather than a pressed button: a button here reads as
          "sync now". No border either; it sits in the header's quiet status
          group, and the switch alone says it is a setting. The trigger is the
          label, not the switch, so the explanation still shows while the
          status loads and the switch is disabled. */}
      <TooltipTrigger asChild>
        <Label
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap font-medium text-muted-foreground text-xs transition-colors hover:text-foreground",
            enabled && "text-foreground",
          )}
          htmlFor='stats-match-sync'>
          {t("stats.settings.matchSync")}
          <Switch
            checked={enabled}
            disabled={!status || setEnabled.isPending || setConsent.isPending}
            id='stats-match-sync'
            onCheckedChange={handleEnableChange}
          />
        </Label>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs space-y-1'>
        <p>{t("matchSync.description")}</p>
        <p>{t("matchSync.about.summary")}</p>
      </TooltipContent>
    </Tooltip>
  );
};
