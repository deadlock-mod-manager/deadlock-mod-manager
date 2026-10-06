import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { Settings2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMatchSync } from "@/hooks/use-match-sync";
import { useMatchSyncToggle } from "@/hooks/use-match-sync-toggle";

/**
 * Page-level settings for the Stats page. Match sync is what keeps this page
 * current, so it can be flipped from here instead of a trip to Settings; the
 * consent dialog still guards turning it on, and the full controls (quota,
 * full sync) stay in the privacy tab.
 */
export const StatsSettings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, setConsent, setEnabled } = useMatchSync();
  const handleEnableChange = useMatchSyncToggle({
    status,
    setConsent,
    setEnabled,
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("stats.settings.title")}
          className='h-8 w-8'
          size='icon'
          variant='outline'>
          <Settings2 className='h-4 w-4' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80'>
        <div className='flex flex-col gap-3'>
          <p className='font-semibold text-sm'>{t("stats.settings.title")}</p>
          <div className='flex items-start justify-between gap-4'>
            <div className='space-y-1'>
              <Label className='font-bold text-sm' htmlFor='stats-match-sync'>
                {t("matchSync.enable.title")}
              </Label>
              <p className='text-muted-foreground text-xs'>
                {t("matchSync.about.summary")}
              </p>
            </div>
            <Switch
              checked={status?.enabled ?? false}
              disabled={!status || setEnabled.isPending || setConsent.isPending}
              id='stats-match-sync'
              onCheckedChange={handleEnableChange}
            />
          </div>
          <Button
            className='h-auto w-fit p-0 text-xs'
            onClick={() =>
              navigate("/settings", { state: { activeTab: "privacy" } })
            }
            variant='link'>
            {t("stats.settings.moreOptions")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
