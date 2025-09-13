import { useTranslation } from 'react-i18next';
import { usePersistedStore } from '@/lib/store';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';

const PrivacySettings = () => {
  const { t } = useTranslation();
  const {
    nsfwSettings,
    updateNSFWSettings,
    telemetrySettings,
    updateTelemetrySettings,
  } = usePersistedStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base">{t('privacy.hideNSFWContent')}</Label>
          <div className="text-muted-foreground text-sm">
            {t('privacy.hideNSFWDescription')}
          </div>
        </div>
        <Switch
          checked={nsfwSettings.hideNSFW}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ hideNSFW: checked })
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base">{t('privacy.showLikelyNSFW')}</Label>
          <div className="text-muted-foreground text-sm">
            {t('privacy.showLikelyNSFWDescription')}
          </div>
        </div>
        <Switch
          checked={nsfwSettings.showLikelyNSFW}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ showLikelyNSFW: checked })
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base">{t('privacy.disableNSFWBlur')}</Label>
          <div className="text-muted-foreground text-sm">
            {t('privacy.disableNSFWBlurDescription')}
          </div>
        </div>
        <Switch
          checked={nsfwSettings.disableBlur}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ disableBlur: checked })
          }
        />
      </div>

      {!nsfwSettings.disableBlur && (
        <div className="space-y-3">
          <div className="space-y-0.5">
            <Label className="text-base">{t('privacy.blurStrength')}</Label>
            <div className="text-muted-foreground text-sm">
              {t('privacy.blurStrengthDescription')}
            </div>
          </div>
          <div className="px-3">
            <Slider
              className="w-full"
              max={32}
              min={4}
              onValueChange={([value]) =>
                updateNSFWSettings({ blurStrength: value })
              }
              step={2}
              value={[nsfwSettings.blurStrength]}
            />
            <div className="mt-1 flex justify-between text-muted-foreground text-xs">
              <span>4px</span>
              <span>{nsfwSettings.blurStrength}px</span>
              <span>32px</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base">
            {t('privacy.rememberPerItemChoices')}
          </Label>
          <div className="text-muted-foreground text-sm">
            {t('privacy.rememberPerItemChoicesDescription')}
          </div>
        </div>
        <Switch
          checked={nsfwSettings.rememberPerItemOverrides}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ rememberPerItemOverrides: checked })
          }
        />
      </div>

      {/* Telemetry Settings */}
      <div className="border-t pt-4">
        <h3 className="mb-4 font-semibold text-lg">
          {t('privacy.telemetryTitle')}
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">
                {t('privacy.posthogAnalytics')}
              </Label>
              <div className="text-muted-foreground text-sm">
                {t('privacy.posthogAnalyticsDescription')}
              </div>
            </div>
            <Switch
              checked={telemetrySettings.posthogEnabled}
              onCheckedChange={(checked) =>
                updateTelemetrySettings({ posthogEnabled: checked })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;
