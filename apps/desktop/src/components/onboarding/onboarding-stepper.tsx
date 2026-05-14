import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type StepState = "completed" | "active" | "upcoming";

type OnboardingStepperProps = {
  currentStep: number;
  totalSteps: number;
  completedSteps: Set<number>;
};

export const OnboardingStepper = ({
  currentStep,
  totalSteps,
  completedSteps,
}: OnboardingStepperProps) => {
  const getStepState = (step: number): StepState => {
    if (completedSteps.has(step) && step !== currentStep) return "completed";
    if (step === currentStep) return "active";
    return "upcoming";
  };

  return (
    <div className='flex items-center justify-center gap-0'>
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const state = getStepState(step);
        const isLast = step === totalSteps;

        return (
          <div key={step} className='flex items-center'>
            <div className='relative flex flex-col items-center'>
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full transition-all duration-300",
                  state === "completed" &&
                    "bg-primary text-primary-foreground shadow-[0_0_8px_hsl(var(--primary)/0.4)]",
                  state === "active" &&
                    "ring-2 ring-primary bg-primary/15 shadow-[0_0_12px_hsl(var(--primary)/0.3)]",
                  state === "upcoming" &&
                    "ring-1 ring-muted-foreground/30 bg-transparent",
                )}>
                {state === "completed" ? (
                  <CheckIcon weight='bold' className='size-3.5' />
                ) : state === "active" ? (
                  <div className='size-2 rounded-full bg-primary' />
                ) : (
                  <span className='text-xs text-muted-foreground/50 tabular-nums'>
                    {step}
                  </span>
                )}
              </div>
            </div>

            {!isLast && (
              <div className='relative mx-1 h-px w-8'>
                <div className='absolute inset-0 bg-muted-foreground/20' />
                <div
                  className='absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out'
                  style={{
                    width:
                      state === "completed" || state === "active"
                        ? "100%"
                        : "0%",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
