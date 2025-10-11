import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Rocket } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { APP_NAME } from "@/lib/constants";
import { OnboardingStepAddons } from "./step-addons";
import { OnboardingStepApi } from "./step-api";
import { OnboardingStepGamePath } from "./step-game-path";

type OnboardingWizardProps = {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
};

export const OnboardingWizard = ({
  open,
  onComplete,
  onSkip,
}: OnboardingWizardProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [step1Complete, setStep1Complete] = useState(false);
  const [step2Complete, setStep2Complete] = useState(false);
  const [step3Complete, setStep3Complete] = useState(false);

  const totalSteps = 3;
  const progress = (currentStep / totalSteps) * 100;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    if (currentStep === 1) return step1Complete;
    if (currentStep === 2) return step2Complete;
    if (currentStep === 3) return true;
    return false;
  };

  const handleStep1Complete = () => {
    setStep1Complete(true);
  };

  const handleStep2Complete = () => {
    setStep2Complete(true);
  };

  const handleStep2Error = () => {
    setStep2Complete(false);
  };

  const handleStep3Complete = () => {
    setStep3Complete(true);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <div className='flex items-center gap-2'>
            <Rocket className='h-5 w-5 text-primary' />
            <DialogTitle>{t("onboarding.title")}</DialogTitle>
            <Badge variant='secondary'>
              {t("onboarding.stepIndicator", {
                current: currentStep,
                total: totalSteps,
              })}
            </Badge>
          </div>
          <DialogDescription>
            {t("onboarding.welcome", { appName: APP_NAME })}
          </DialogDescription>
        </DialogHeader>

        <div className='py-4'>
          <Progress value={progress} className='h-2 mb-6' />

          {currentStep === 1 && (
            <OnboardingStepGamePath onComplete={handleStep1Complete} />
          )}

          {currentStep === 2 && (
            <OnboardingStepApi
              onComplete={handleStep2Complete}
              onError={handleStep2Error}
            />
          )}

          {currentStep === 3 && (
            <OnboardingStepAddons onComplete={handleStep3Complete} />
          )}
        </div>

        <DialogFooter className='flex-row justify-between gap-2 sm:justify-between'>
          <Button variant='ghost' onClick={onSkip}>
            {t("onboarding.skip")}
          </Button>

          <div className='flex gap-2'>
            {currentStep > 1 && (
              <Button variant='outline' onClick={handleBack}>
                {t("onboarding.back")}
              </Button>
            )}

            <Button
              variant='default'
              onClick={handleNext}
              disabled={!canProceed()}>
              {currentStep === totalSteps
                ? t("onboarding.finish")
                : t("onboarding.next")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
