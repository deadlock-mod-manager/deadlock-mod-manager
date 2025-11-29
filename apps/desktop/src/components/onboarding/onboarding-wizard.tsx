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
import { useCallback, useMemo, useState } from "react";
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

type StepComponentProps = {
  onComplete: () => void;
  onError?: () => void;
};

type StepConfig = {
  step: number;
  component: React.ComponentType<StepComponentProps>;
  requiresCompletion: boolean;
  requiresErrorHandler?: boolean;
};

const STEP_CONFIGS: StepConfig[] = [
  {
    step: 1,
    component:
      OnboardingStepGamePath as React.ComponentType<StepComponentProps>,
    requiresCompletion: true,
  },
  {
    step: 2,
    component: OnboardingStepApi as React.ComponentType<StepComponentProps>,
    requiresCompletion: true,
    requiresErrorHandler: true,
  },
  {
    step: 3,
    component: OnboardingStepAddons as React.ComponentType<StepComponentProps>,
    requiresCompletion: false,
  },
];

const TOTAL_STEPS = STEP_CONFIGS.length;

export const OnboardingWizard = ({
  open,
  onComplete,
  onSkip,
}: OnboardingWizardProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const currentStepConfig = useMemo(
    () => STEP_CONFIGS.find((config) => config.step === currentStep),
    [currentStep],
  );

  const progress = useMemo(
    () => (currentStep / TOTAL_STEPS) * 100,
    [currentStep],
  );

  const isCurrentStepComplete = useMemo(
    () => completedSteps.has(currentStep),
    [completedSteps, currentStep],
  );

  const canProceed = useMemo(() => {
    if (!currentStepConfig) return false;
    return !currentStepConfig.requiresCompletion || isCurrentStepComplete;
  }, [currentStepConfig, isCurrentStepComplete]);

  const isLastStep = useMemo(() => currentStep === TOTAL_STEPS, [currentStep]);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [isLastStep, onComplete]);

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }, []);

  const handleStepComplete = useCallback((step: number) => {
    setCompletedSteps((prev) => new Set(prev).add(step));
  }, []);

  const handleStepError = useCallback((step: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.delete(step);
      return next;
    });
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onSkip();
      }
    },
    [onSkip],
  );

  const createStepHandlers = useCallback(
    (step: number, requiresErrorHandler = false): StepComponentProps => {
      const handlers: StepComponentProps = {
        onComplete: () => handleStepComplete(step),
      };
      if (requiresErrorHandler) {
        handlers.onError = () => handleStepError(step);
      }
      return handlers;
    },
    [handleStepComplete, handleStepError],
  );

  const CurrentStepComponent = currentStepConfig?.component;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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

          {CurrentStepComponent && currentStepConfig && (
            <CurrentStepComponent
              {...createStepHandlers(
                currentStep,
                currentStepConfig.requiresErrorHandler,
              )}
            />
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
              disabled={!canProceed}>
              {isLastStep ? t("onboarding.finish") : t("onboarding.next")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
