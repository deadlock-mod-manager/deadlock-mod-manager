import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Info } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type DisclaimerStepProps = {
  onComplete: () => void;
};

export const OnboardingStepDisclaimer = ({
  onComplete,
}: DisclaimerStepProps) => {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (acknowledged) {
      onComplete();
    }
  }, [acknowledged, onComplete]);

  const handleAcknowledgeChange = useCallback((checked: boolean) => {
    setAcknowledged(checked);
  }, []);

  return (
    <div className='space-y-6'>
      <div>
        <h3 className='text-lg font-semibold'>
          {t("onboarding.disclaimer.title")}
        </h3>
        <p className='text-sm text-muted-foreground mt-2'>
          {t("onboarding.disclaimer.description")}
        </p>
      </div>

      <div className='flex items-start gap-3 p-4 border rounded-lg bg-blue-500/10 border-blue-500/20'>
        <Info className='h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5' />
        <div className='flex-1 min-w-0'>
          <p className='text-sm text-foreground'>
            {t("onboarding.disclaimer.notice")}
          </p>
        </div>
      </div>

      <div className='flex items-start gap-3 p-4 border rounded-lg'>
        <Checkbox
          checked={acknowledged}
          id='acknowledge-disclaimer'
          onCheckedChange={handleAcknowledgeChange}
        />
        <label
          className='text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1'
          htmlFor='acknowledge-disclaimer'>
          {t("onboarding.disclaimer.acknowledge")}
        </label>
      </div>
    </div>
  );
};
