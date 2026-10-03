import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { usePersistedStore } from "@/lib/store";

const PrivacySettings = () => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const confirm = useConfirm();
  const {
    nsfwSettings,
    updateNSFWSettings,
    perItemNSFWOverrides,
    clearPerItemNSFWOverrides,
    telemetrySettings,
    updateTelemetrySettings,
  } = usePersistedStore();

  const overrideCount = Object.keys(perItemNSFWOverrides).length;
  const clearOverrides = useMutation({
    mutationFn: async () => {
      const confirmed = await confirm({
        title: t("privacy.clearPerItemChoices"),
        body: t("privacy.clearPerItemChoicesConfirm", { count: overrideCount }),
        actionButton: t("privacy.clearPerItemChoices"),
        cancelButton: t("common.cancel"),
        tone: "destructive",
      });
      if (confirmed) clearPerItemNSFWOverrides();
    },
  });

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='space-y-0.5'>
          <Label className='text-base'>{t("privacy.hideNSFWContent")}</Label>
          <div className='text-muted-foreground text-sm'>
            {t("privacy.hideNSFWDescription")}
          </div>
        </div>
        <Switch
          aria-label={t("privacy.hideNSFWContent")}
          checked={nsfwSettings.hideNSFW}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ hideNSFW: checked })
          }
        />
      </div>

      <div className='flex items-center justify-between'>
        <div className='space-y-0.5'>
          <Label className='text-base'>{t("privacy.showLikelyNSFW")}</Label>
          <div className='text-muted-foreground text-sm'>
            {t("privacy.showLikelyNSFWDescription")}
          </div>
        </div>
        <Switch
          aria-label={t("privacy.showLikelyNSFW")}
          checked={nsfwSettings.showLikelyNSFW}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ showLikelyNSFW: checked })
          }
        />
      </div>

      <div className='flex items-center justify-between'>
        <div className='space-y-0.5'>
          <Label className='text-base'>{t("privacy.disableNSFWBlur")}</Label>
          <div className='text-muted-foreground text-sm'>
            {t("privacy.disableNSFWBlurDescription")}
          </div>
        </div>
        <Switch
          aria-label={t("privacy.disableNSFWBlur")}
          checked={nsfwSettings.disableBlur}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ disableBlur: checked })
          }
        />
      </div>

      {!nsfwSettings.disableBlur && (
        <div className='space-y-3'>
          <div className='space-y-0.5'>
            <Label className='text-base'>{t("privacy.blurStrength")}</Label>
            <div className='text-muted-foreground text-sm'>
              {t("privacy.blurStrengthDescription")}
            </div>
          </div>
          <div className='px-3'>
            <Slider
              aria-label={t("privacy.blurStrength")}
              className='w-full'
              max={32}
              min={4}
              onValueChange={([value]) =>
                updateNSFWSettings({ blurStrength: value })
              }
              step={2}
              value={[nsfwSettings.blurStrength]}
            />
            <div className='mt-1 flex justify-between text-muted-foreground text-xs'>
              <span>4px</span>
              <span>{nsfwSettings.blurStrength}px</span>
              <span>32px</span>
            </div>
          </div>
        </div>
      )}

      <div className='flex items-center justify-between'>
        <div className='space-y-0.5'>
          <Label className='text-base'>
            {t("privacy.rememberPerItemChoices")}
          </Label>
          <div className='text-muted-foreground text-sm'>
            {t("privacy.rememberPerItemChoicesDescription")}
          </div>
        </div>
        <Switch
          aria-label={t("privacy.rememberPerItemChoices")}
          checked={nsfwSettings.rememberPerItemOverrides}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ rememberPerItemOverrides: checked })
          }
        />
      </div>

      <div className='flex items-center justify-between gap-4'>
        <div className='space-y-0.5'>
          <Label className='text-base'>
            {t("privacy.savedPerItemChoices")}
          </Label>
          <div className='text-muted-foreground text-sm'>
            {t("privacy.savedPerItemChoicesDescription", {
              count: overrideCount,
            })}
          </div>
        </div>
        <Button
          disabled={overrideCount === 0 || clearOverrides.isPending}
          onClick={() => clearOverrides.mutate()}
          variant='outline'>
          {t("privacy.clearPerItemChoices")}
        </Button>
      </div>

      {/* Telemetry Settings */}
      <div className='border-t pt-4'>
        <h3 className='mb-4 font-semibold text-lg'>
          {t("privacy.telemetryTitle")}
        </h3>

        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div className='space-y-0.5'>
              <Label className='text-base'>
                {t("privacy.analyticsEnabled")}
              </Label>
              <div className='text-muted-foreground text-sm'>
                {t("privacy.analyticsEnabledDescription")}
              </div>
            </div>
            <Switch
              aria-label={t("privacy.analyticsEnabled")}
              checked={telemetrySettings.analyticsEnabled}
              onCheckedChange={(checked) => {
                const oldValue = telemetrySettings.analyticsEnabled;
                updateTelemetrySettings({ analyticsEnabled: checked });
                analytics.trackSettingChanged(
                  "analytics_enabled",
                  oldValue,
                  checked,
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;
