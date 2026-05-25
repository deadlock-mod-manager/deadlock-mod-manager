import { Button, buttonVariants } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  ChartLineUpIcon,
  CheckCircleIcon,
  HeartIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TelemetryConsentContent } from "@/components/telemetry/telemetry-consent-content";
import { usePersistedStore } from "@/lib/store";

type DialogStep = "consent" | "thankYou";

export const TelemetryConsentDialog = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState<DialogStep>("consent");
  const hasCompletedOnboarding = usePersistedStore(
    (state) => state.hasCompletedOnboarding,
  );
  const telemetrySettings = usePersistedStore(
    (state) => state.telemetrySettings,
  );
  const updateTelemetrySettings = usePersistedStore(
    (state) => state.updateTelemetrySettings,
  );

  const shouldShowConsentPrompt =
    hasCompletedOnboarding &&
    !telemetrySettings.hasSeenTelemetryPrompt &&
    !telemetrySettings.analyticsEnabled;

  const isOpen = shouldShowConsentPrompt || step === "thankYou";

  useEffect(() => {
    if (shouldShowConsentPrompt) {
      setStep("consent");
    }
  }, [shouldShowConsentPrompt]);

  const handleEnable = useCallback(() => {
    updateTelemetrySettings({
      analyticsEnabled: true,
      hasSeenTelemetryPrompt: true,
    });
    setStep("thankYou");
  }, [updateTelemetrySettings]);

  const handleDecline = useCallback(() => {
    updateTelemetrySettings({
      analyticsEnabled: false,
      hasSeenTelemetryPrompt: true,
    });
  }, [updateTelemetrySettings]);

  const handleCloseThankYou = useCallback(() => {
    setStep("consent");
  }, []);

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className='border-0 sm:max-w-md'
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}>
        {step === "thankYou" ? (
          <>
            <DialogHeader>
              <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-500/15'>
                <HeartIcon
                  className='size-5 text-emerald-500'
                  weight='duotone'
                />
              </div>
              <DialogTitle>{t("telemetryConsent.thankYou")}</DialogTitle>
              <DialogDescription>
                {t("telemetryConsent.thankYouDescription")}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                className='w-full'
                onClick={handleCloseThankYou}
                type='button'>
                {t("common.close")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10'>
                <ChartLineUpIcon
                  className='size-5 text-primary'
                  weight='duotone'
                />
              </div>
              <DialogTitle>{t("telemetryConsent.title")}</DialogTitle>
              <DialogDescription>
                {t("telemetryConsent.dialogDescription")}
              </DialogDescription>
            </DialogHeader>

            <TelemetryConsentContent
              analyticsEnabled={false}
              onAnalyticsEnabledChange={() => {}}
            />

            <DialogFooter className='gap-2 sm:gap-2'>
              <button
                className={buttonVariants({ variant: "outline" })}
                onClick={handleDecline}
                type='button'>
                <XIcon className='size-4' weight='bold' />
                {t("telemetryConsent.disableButton")}
              </button>
              <Button onClick={handleEnable} type='button'>
                <CheckCircleIcon className='size-4' weight='bold' />
                {t("telemetryConsent.enableButton")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
