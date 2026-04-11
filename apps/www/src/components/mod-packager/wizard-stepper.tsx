import { cn } from "@deadlock-mods/ui/lib/utils";
import { Check } from "lucide-react";

export interface WizardStep {
  id: string;
  label: string;
  description: string;
}

interface WizardStepperProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick: (step: number) => void;
  completedSteps: Set<number>;
}

export function WizardStepper({
  steps,
  currentStep,
  onStepClick,
  completedSteps,
}: WizardStepperProps) {
  return (
    <nav aria-label='Wizard progress' className='mb-8'>
      <ol className='flex items-center gap-2'>
        {steps.map((step, index) => {
          const isCompleted = completedSteps.has(index);
          const isCurrent = currentStep === index;
          const isClickable = isCompleted || index <= currentStep;

          return (
            <li key={step.id} className='flex flex-1 items-center'>
              <button
                type='button'
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(index)}
                className={cn(
                  "group flex w-full flex-col items-center gap-1.5 text-center transition-colors",
                  isClickable
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-50",
                )}>
                <div className='flex w-full items-center gap-2'>
                  {index > 0 && (
                    <div
                      className={cn(
                        "h-px flex-1 transition-colors",
                        isCompleted || isCurrent ? "bg-primary" : "bg-border",
                      )}
                    />
                  )}
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors",
                      isCurrent &&
                        "border-primary bg-primary text-primary-foreground",
                      isCompleted &&
                        !isCurrent &&
                        "border-primary bg-primary/10 text-primary",
                      !isCurrent &&
                        !isCompleted &&
                        "border-muted-foreground/30 text-muted-foreground",
                    )}>
                    {isCompleted && !isCurrent ? (
                      <Check className='h-4 w-4' />
                    ) : (
                      index + 1
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "h-px flex-1 transition-colors",
                        isCompleted ? "bg-primary" : "bg-border",
                      )}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "hidden text-xs md:block",
                    isCurrent
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}>
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
