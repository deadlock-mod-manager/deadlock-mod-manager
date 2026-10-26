import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FileserverSettings } from "@/components/settings/fileserver-settings";

type OnboardingStepNetworkProps = {
  onComplete: () => void;
};

export const OnboardingStepNetwork = ({
  onComplete,
}: OnboardingStepNetworkProps) => {
  const { t } = useTranslation();

  useEffect(() => {
    onComplete();
  }, [onComplete]);

  return (
    <div className='space-y-4'>
      <div>
        <h3 className='font-["Forevs_Demo"] text-lg tracking-wide'>
          {t("onboarding.network.title")}
        </h3>
        <p className='mt-2 text-sm text-muted-foreground'>
          {t("onboarding.network.description")}
        </p>
      </div>

      <FileserverSettings />
    </div>
  );
};
