import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { useMutation } from "@tanstack/react-query";
import { platform } from "@tauri-apps/plugin-os";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import {
  SettingRow,
  SettingToggleRow,
} from "@/components/settings/setting-row";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { NETWORK_ACTIVITY_DOCS_URL } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";

const BLUR_STRENGTH_DESCRIPTION_ID = "privacy-blur-strength-description";
const SAVED_CHOICES_DESCRIPTION_ID = "privacy-saved-choices-description";
const NETWORK_ACTIVITY_DESCRIPTION_ID = "privacy-network-activity-description";

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
    linuxCanvasNSFWBlur,
    setLinuxCanvasNSFWBlur,
    playerStatsEnabled,
    setPlayerStatsEnabled,
  } = usePersistedStore();
  const isLinux = platform() === "linux";

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
      <SettingToggleRow
        checked={nsfwSettings.hideNSFW}
        description={t("privacy.hideNSFWDescription")}
        id='toggle-privacy-hide-nsfw'
        onCheckedChange={(checked) => updateNSFWSettings({ hideNSFW: checked })}
        title={t("privacy.hideNSFWContent")}
      />

      <SettingToggleRow
        checked={nsfwSettings.showLikelyNSFW}
        description={t("privacy.showLikelyNSFWDescription")}
        id='toggle-privacy-show-likely-nsfw'
        onCheckedChange={(checked) =>
          updateNSFWSettings({ showLikelyNSFW: checked })
        }
        title={t("privacy.showLikelyNSFW")}
      />

      <SettingToggleRow
        checked={nsfwSettings.disableBlur}
        description={t("privacy.disableNSFWBlurDescription")}
        id='toggle-privacy-disable-blur'
        onCheckedChange={(checked) =>
          updateNSFWSettings({ disableBlur: checked })
        }
        title={t("privacy.disableNSFWBlur")}
      />

      {!nsfwSettings.disableBlur && (
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label className='font-bold text-sm'>
              {t("privacy.blurStrength")}
            </Label>
            <p
              className='text-muted-foreground text-sm'
              id={BLUR_STRENGTH_DESCRIPTION_ID}>
              {t("privacy.blurStrengthDescription")}
            </p>
          </div>
          <div className='px-3'>
            <Slider
              aria-describedby={BLUR_STRENGTH_DESCRIPTION_ID}
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

      {isLinux && !nsfwSettings.disableBlur && (
        <SettingToggleRow
          checked={linuxCanvasNSFWBlur}
          description={t("privacy.lightweightNSFWBlurDescription")}
          id='toggle-privacy-lightweight-blur'
          onCheckedChange={setLinuxCanvasNSFWBlur}
          title={t("privacy.lightweightNSFWBlur")}
        />
      )}

      <SettingToggleRow
        checked={nsfwSettings.rememberPerItemOverrides}
        description={t("privacy.rememberPerItemChoicesDescription")}
        id='toggle-privacy-remember-per-item'
        onCheckedChange={(checked) =>
          updateNSFWSettings({ rememberPerItemOverrides: checked })
        }
        title={t("privacy.rememberPerItemChoices")}
      />

      <SettingRow
        description={t("privacy.savedPerItemChoicesDescription", {
          count: overrideCount,
        })}
        descriptionId={SAVED_CHOICES_DESCRIPTION_ID}
        title={t("privacy.savedPerItemChoices")}>
        <Button
          aria-describedby={SAVED_CHOICES_DESCRIPTION_ID}
          disabled={overrideCount === 0 || clearOverrides.isPending}
          onClick={() => clearOverrides.mutate()}
          variant='outline'>
          {t("privacy.clearPerItemChoices")}
        </Button>
      </SettingRow>

      <div className='border-t pt-4'>
        <h3 className='mb-4 font-semibold text-lg'>
          {t("privacy.playerStatsTitle")}
        </h3>

        <SettingToggleRow
          checked={playerStatsEnabled}
          description={t("privacy.playerStatsDescription")}
          id='toggle-privacy-player-stats'
          onCheckedChange={setPlayerStatsEnabled}
          title={t("privacy.playerStats")}
        />
      </div>

      {/* Telemetry Settings */}
      <div className='border-t pt-4'>
        <h3 className='mb-4 font-semibold text-lg'>
          {t("privacy.telemetryTitle")}
        </h3>

        <SettingToggleRow
          checked={telemetrySettings.analyticsEnabled}
          description={t("privacy.analyticsEnabledDescription")}
          id='toggle-privacy-analytics'
          onCheckedChange={(checked) => {
            const oldValue = telemetrySettings.analyticsEnabled;
            updateTelemetrySettings({ analyticsEnabled: checked });
            analytics.trackSettingChanged(
              "analytics_enabled",
              oldValue,
              checked,
            );
          }}
          title={t("privacy.analyticsEnabled")}
        />

        <SettingRow
          description={t("privacy.networkActivityDescription")}
          descriptionId={NETWORK_ACTIVITY_DESCRIPTION_ID}
          title={t("privacy.networkActivity")}>
          <Button
            aria-describedby={NETWORK_ACTIVITY_DESCRIPTION_ID}
            onClick={() => void openUrl(NETWORK_ACTIVITY_DOCS_URL)}
            variant='outline'>
            {t("privacy.networkActivityOpen")}
          </Button>
        </SettingRow>
      </div>
    </div>
  );
};

export default PrivacySettings;
