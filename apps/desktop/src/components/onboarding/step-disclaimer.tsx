import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { InfoIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

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
    <div className='space-y-5'>
      <div>
        <h3 className='font-["Forevs_Demo"] text-lg tracking-wide'>
          {t("onboarding.disclaimer.title")}
        </h3>
        <p className='mt-2 text-sm text-muted-foreground'>
          {t("onboarding.disclaimer.description")}
        </p>
      </div>

      <div className='flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4'>
        <InfoIcon
          weight='duotone'
          className='mt-0.5 size-5 shrink-0 text-primary'
        />
        <p className='text-sm text-foreground/90'>
          {t("onboarding.disclaimer.notice")}
        </p>
      </div>

      <button
        type='button'
        onClick={() => handleAcknowledgeChange(!acknowledged)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-all",
          acknowledged
            ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
            : "border-border hover:border-primary/30 hover:bg-accent/30",
        )}>
        <Checkbox
          checked={acknowledged}
          id='acknowledge-disclaimer'
          onCheckedChange={handleAcknowledgeChange}
          tabIndex={-1}
        />
        <label
          className='cursor-pointer text-sm'
          htmlFor='acknowledge-disclaimer'>
          {t("onboarding.disclaimer.acknowledge")}
        </label>
      </button>
    </div>
  );
};
