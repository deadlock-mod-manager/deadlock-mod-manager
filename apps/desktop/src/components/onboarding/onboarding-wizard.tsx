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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "@/hooks/use-onboarding";
import { APP_NAME } from "@/lib/constants";
import { OnboardingStepAddons } from "./step-addons";
import { OnboardingStepApi } from "./step-api";
import { OnboardingStepDisclaimer } from "./step-disclaimer";
import { OnboardingStepGamePath } from "./step-game-path";

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
      OnboardingStepDisclaimer as React.ComponentType<StepComponentProps>,
    requiresCompletion: true,
  },
  {
    step: 2,
    component:
      OnboardingStepGamePath as React.ComponentType<StepComponentProps>,
    requiresCompletion: true,
  },
  {
    step: 3,
    component: OnboardingStepApi as React.ComponentType<StepComponentProps>,
    requiresCompletion: true,
    requiresErrorHandler: true,
  },
  {
    step: 4,
    component: OnboardingStepAddons as React.ComponentType<StepComponentProps>,
    requiresCompletion: false,
  },
];

const TOTAL_STEPS = STEP_CONFIGS.length;

export const OnboardingWizard = () => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const { showOnboarding, completeOnboarding, skipOnboarding } =
    useOnboarding();
  const showOnboardingRef = useRef(showOnboarding);
  const isHandlingCloseRef = useRef(false);
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
      completeOnboarding();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [isLastStep, completeOnboarding]);

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

  useEffect(() => {
    showOnboardingRef.current = showOnboarding;
  }, [showOnboarding]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && showOnboardingRef.current && !isHandlingCloseRef.current) {
        isHandlingCloseRef.current = true;
        showOnboardingRef.current = false;
        skipOnboarding();
        setTimeout(() => {
          isHandlingCloseRef.current = false;
        }, 0);
      } else {
        showOnboardingRef.current = isOpen;
      }
    },
    [skipOnboarding],
  );

  const stepHandlers = useMemo<StepComponentProps>(() => {
    if (!currentStepConfig) {
      return { onComplete: () => {} };
    }
    const handlers: StepComponentProps = {
      onComplete: () => handleStepComplete(currentStep),
    };
    if (currentStepConfig.requiresErrorHandler) {
      handlers.onError = () => handleStepError(currentStep);
    }
    return handlers;
  }, [currentStep, currentStepConfig, handleStepComplete, handleStepError]);

  const onSkip = useCallback(() => {
    skipOnboarding();
  }, [skipOnboarding]);

  const CurrentStepComponent = currentStepConfig?.component;

  return (
    <Dialog open={showOnboarding} onOpenChange={handleOpenChange}>
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

          {CurrentStepComponent && <CurrentStepComponent {...stepHandlers} />}
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
