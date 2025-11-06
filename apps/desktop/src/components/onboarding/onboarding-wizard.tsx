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

const TOTAL_STEPS = 3;

export const OnboardingWizard = ({
  open,
  onComplete,
  onSkip,
}: OnboardingWizardProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const progress = (currentStep / TOTAL_STEPS) * 100;
  const isCurrentStepComplete = completedSteps.has(currentStep);

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
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

  const handleStepComplete = (step: number) => {
    setCompletedSteps((prev) => new Set(prev).add(step));
  };

  const handleStepError = (step: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.delete(step);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onSkip();
        }
      }}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <div className='flex items-center gap-2'>
            <Rocket className='h-5 w-5 text-primary' />
            <DialogTitle>{t("onboarding.title")}</DialogTitle>
            <Badge variant='secondary'>
              {t("onboarding.stepIndicator", {
                current: currentStep,
                total: TOTAL_STEPS,
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
            <OnboardingStepGamePath onComplete={() => handleStepComplete(1)} />
          )}

          {currentStep === 2 && (
            <OnboardingStepApi
              onComplete={() => handleStepComplete(2)}
              onError={() => handleStepError(2)}
            />
          )}

          {currentStep === 3 && (
            <OnboardingStepAddons onComplete={() => handleStepComplete(3)} />
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
              disabled={!isCurrentStepComplete && currentStep !== 3}>
              {currentStep === TOTAL_STEPS
                ? t("onboarding.finish")
                : t("onboarding.next")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
