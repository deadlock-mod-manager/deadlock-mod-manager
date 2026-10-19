import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBisectDialog } from "@/lib/bisect/dialogs";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BisectIllustration, type BisectScene } from "./bisect-illustration";

const STEPS: BisectScene[] = ["split", "check", "narrow", "restore"];

export const BisectExplainerDialog = () => {
  const { t } = useTranslation();
  const open = useBisectDialog((state) => state.dialog === "explainer");
  const next = useBisectDialog((state) => state.explainerNext);
  const close = useBisectDialog((state) => state.close);
  const showSetup = useBisectDialog((state) => state.showSetup);
  const markSeen = usePersistedStore((state) => state.markBisectExplainerSeen);
  const [step, setStep] = useState(0);
  const scene = STEPS[step];
  const last = step === STEPS.length - 1;

  const dismiss = () => {
    markSeen();
    setStep(0);
    close();
  };

  const finish = () => {
    markSeen();
    setStep(0);
    if (next === "setup") showSetup();
    else close();
  };

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && dismiss()} open={open}>
      <DialogContent className='gap-5 sm:max-w-lg'>
        <DialogHeader>
          <p className='text-xs font-medium uppercase tracking-widest text-primary'>
            {t("bisect.explainer.eyebrow")}
          </p>
          <DialogTitle>
            {t(`bisect.explainer.steps.${scene}.title`)}
          </DialogTitle>
          <DialogDescription
            className='onboarding-step-enter min-h-[3.75rem]'
            key={scene}>
            {t(`bisect.explainer.steps.${scene}.body`)}
          </DialogDescription>
        </DialogHeader>

        <BisectIllustration scene={scene} />

        <DialogFooter className='flex-row items-center justify-between gap-3 sm:justify-between sm:space-x-0'>
          <div className='flex items-center gap-1.5'>
            {STEPS.map((item, index) => (
              <button
                aria-current={index === step ? "step" : undefined}
                aria-label={t("bisect.explainer.goToStep", {
                  current: index + 1,
                  total: STEPS.length,
                })}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  index === step
                    ? "w-6 bg-primary"
                    : "w-1.5 bg-muted hover:bg-muted-foreground/50",
                )}
                key={item}
                onClick={() => setStep(index)}
                type='button'
              />
            ))}
          </div>
          <div className='flex gap-2'>
            {step > 0 ? (
              <Button onClick={() => setStep(step - 1)} variant='ghost'>
                <ArrowLeftIcon aria-hidden className='size-4' />
                {t("bisect.explainer.back")}
              </Button>
            ) : (
              next === "setup" && (
                <Button onClick={finish} variant='ghost'>
                  {t("bisect.explainer.skip")}
                </Button>
              )
            )}
            {last ? (
              <Button onClick={finish}>
                {next === "setup"
                  ? t("bisect.explainer.chooseMods")
                  : t("bisect.explainer.done")}
                {next === "setup" && (
                  <ArrowRightIcon aria-hidden className='size-4' />
                )}
              </Button>
            ) : (
              <Button onClick={() => setStep(step + 1)}>
                {t("bisect.explainer.next")}
                <ArrowRightIcon aria-hidden className='size-4' />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
