import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { ChartLineUpIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PRIVACY_POLICY_URL } from "@/lib/constants";

type TelemetryConsentContentProps = {
  analyticsEnabled: boolean;
  onAnalyticsEnabledChange: (enabled: boolean) => void;
  showSwitch?: boolean;
};

export const TelemetryConsentContent = ({
  analyticsEnabled,
  onAnalyticsEnabledChange,
  showSwitch = false,
}: TelemetryConsentContentProps) => {
  const { t } = useTranslation();

  const handleOpenPrivacyPolicy = useCallback(() => {
    void openUrl(PRIVACY_POLICY_URL);
  }, []);

  return (
    <div className='space-y-4'>
      <div className='rounded-lg border border-primary/20 bg-primary/5 p-4'>
        <div className='flex items-start gap-3'>
          <ChartLineUpIcon
            weight='duotone'
            className='mt-0.5 size-5 shrink-0 text-primary'
          />
          <div className='space-y-2 text-sm'>
            <p className='font-medium text-foreground'>
              {t("telemetryConsent.whatWeCollectTitle")}
            </p>
            <ul className='list-disc space-y-1 pl-4 text-foreground/80'>
              <li>{t("telemetryConsent.whatWeCollectHwid")}</li>
              <li>{t("telemetryConsent.whatWeCollectFeatures")}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className='rounded-lg border border-border bg-muted/30 p-4'>
        <div className='flex items-start gap-3'>
          <ShieldCheckIcon
            weight='duotone'
            className='mt-0.5 size-5 shrink-0 text-emerald-500'
          />
          <div className='space-y-2 text-sm'>
            <p className='font-medium text-foreground'>
              {t("telemetryConsent.whatWeDoNotCollectTitle")}
            </p>
            <ul className='list-disc space-y-1 pl-4 text-muted-foreground'>
              <li>{t("telemetryConsent.whatWeDoNotCollectPii")}</li>
              <li>{t("telemetryConsent.whatWeDoNotCollectPersonal")}</li>
            </ul>
          </div>
        </div>
      </div>

      {showSwitch ? (
        <div className='flex items-center justify-between rounded-lg border border-border p-4'>
          <div className='space-y-0.5 pr-4'>
            <Label className='text-base' htmlFor='telemetry-consent-switch'>
              {t("telemetryConsent.enableSwitch")}
            </Label>
            <p className='text-muted-foreground text-sm'>
              {t("telemetryConsent.enableSwitchDescription")}
            </p>
          </div>
          <Switch
            checked={analyticsEnabled}
            id='telemetry-consent-switch'
            onCheckedChange={onAnalyticsEnabledChange}
          />
        </div>
      ) : null}

      <p className='text-muted-foreground text-xs'>
        {t("telemetryConsent.privacyPolicyPrefix")}{" "}
        <button
          className='cursor-pointer font-medium text-primary hover:underline'
          onClick={handleOpenPrivacyPolicy}
          type='button'>
          {t("telemetryConsent.privacyPolicyLink")}
        </button>
      </p>
    </div>
  );
};
