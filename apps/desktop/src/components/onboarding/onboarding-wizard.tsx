import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  RocketIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "@/hooks/use-onboarding";
import { APP_NAME } from "@/lib/constants";
import { OnboardingStepper } from "./onboarding-stepper";
import { OnboardingStepAddons } from "./step-addons";
import { OnboardingStepApi } from "./step-api";
import { OnboardingStepDisclaimer } from "./step-disclaimer";
import { OnboardingStepGamePath } from "./step-game-path";
import { OnboardingStepNetwork } from "./step-network";
import { OnboardingStepTelemetry } from "./step-telemetry";

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
    component: OnboardingStepNetwork as React.ComponentType<StepComponentProps>,
    requiresCompletion: false,
  },
  {
    step: 5,
    component: OnboardingStepAddons as React.ComponentType<StepComponentProps>,
    requiresCompletion: false,
  },
  {
    step: 6,
    component:
      OnboardingStepTelemetry as React.ComponentType<StepComponentProps>,
    requiresCompletion: false,
  },
];

const TOTAL_STEPS = STEP_CONFIGS.length;

export const OnboardingWizard = () => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [stepKey, setStepKey] = useState(0);

  const { showOnboarding, completeOnboarding, skipOnboarding } =
    useOnboarding();
  const showOnboardingRef = useRef(showOnboarding);
  const isHandlingCloseRef = useRef(false);
  const currentStepConfig = useMemo(
    () => STEP_CONFIGS.find((config) => config.step === currentStep),
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
      setStepKey((prev) => prev + 1);
    }
  }, [isLastStep, completeOnboarding]);

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
    setStepKey((prev) => prev + 1);
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
      <DialogContent className='max-w-2xl overflow-hidden border-0 bg-transparent p-0 shadow-2xl'>
        <div className='rounded-lg bg-gradient-to-br from-primary/25 via-primary/8 to-transparent p-px'>
          <div className='rounded-[7px] bg-background'>
            <div className='p-6 pb-0'>
              <DialogHeader>
                <div className='flex items-center gap-3'>
                  <div className='flex size-8 items-center justify-center rounded-lg bg-primary/10'>
                    <RocketIcon
                      weight='duotone'
                      className='size-4 text-primary'
                    />
                  </div>
                  <DialogTitle className='font-["Forevs_Demo"] text-xl tracking-wide'>
                    {t("onboarding.title")}
                  </DialogTitle>
                </div>
                <DialogDescription className='mt-1 pl-11'>
                  {t("onboarding.welcome", { appName: APP_NAME })}
                </DialogDescription>
              </DialogHeader>

              <div className='mt-5'>
                <OnboardingStepper
                  currentStep={currentStep}
                  totalSteps={TOTAL_STEPS}
                  completedSteps={completedSteps}
                />
              </div>
            </div>

            <div className='px-6 pt-5 pb-2'>
              <div
                key={stepKey}
                className='onboarding-step-enter max-h-[55vh] overflow-y-auto pr-1'>
                {CurrentStepComponent && (
                  <CurrentStepComponent {...stepHandlers} />
                )}
              </div>
            </div>

            <div className='flex items-center justify-between gap-2 border-t border-border/50 px-6 py-4'>
              <Button
                variant='ghost'
                size='sm'
                onClick={onSkip}
                className='text-muted-foreground hover:text-foreground'>
                <XIcon className='size-3.5' />
                {t("onboarding.skip")}
              </Button>

              <div className='flex items-center gap-2'>
                {currentStep > 1 && (
                  <Button variant='outline' size='sm' onClick={handleBack}>
                    <ArrowLeftIcon className='size-3.5' />
                    {t("onboarding.back")}
                  </Button>
                )}

                <Button
                  variant='default'
                  size='sm'
                  onClick={handleNext}
                  disabled={!canProceed}>
                  {isLastStep ? (
                    <>
                      <CheckCircleIcon weight='bold' className='size-3.5' />
                      {t("onboarding.finish")}
                    </>
                  ) : (
                    <>
                      {t("onboarding.next")}
                      <ArrowRightIcon className='size-3.5' />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
