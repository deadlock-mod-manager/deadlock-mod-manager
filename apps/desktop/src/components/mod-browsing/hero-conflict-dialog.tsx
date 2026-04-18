import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@deadlock-mods/ui/components/alert-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowLeftRight, TriangleAlert } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHero } from "@/hooks/use-hero";
import type { LocalMod } from "@/types/mods";
import ModCard from "./mod-card";

export type HeroConflictResolution = "swap" | "enable-both" | "cancel";

interface HeroConflictDialogProps {
  open: boolean;
  heroName: string;
  currentMod: LocalMod | null;
  newMod: LocalMod | null;
  onResolve: (resolution: HeroConflictResolution) => void;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const HeroConflictDialog = ({
  open,
  heroName,
  currentMod,
  newMod,
  onResolve,
}: HeroConflictDialogProps) => {
  const { t } = useTranslation();
  const { data: hero } = useHero(open ? heroName : null);
  const [phase, setPhase] = useState<"idle" | "swapping">("idle");
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      resolvedRef.current = false;
    }
  }, [open]);

  const resolveSwapOnce = () => {
    if (resolvedRef.current) {
      return;
    }
    resolvedRef.current = true;
    onResolve("swap");
  };

  const heroImage =
    hero?.images.icon_hero_card_webp ??
    hero?.images.icon_hero_card ??
    hero?.images.icon_image_small_webp ??
    hero?.images.icon_image_small;
  const heroInitial = heroName.charAt(0).toUpperCase();

  const handleSwap = () => {
    if (phase === "swapping") {
      return;
    }
    if (prefersReducedMotion()) {
      resolveSwapOnce();
      return;
    }
    setPhase("swapping");
  };

  const handleOpenChange = (next: boolean) => {
    if (next || phase === "swapping") {
      return;
    }
    onResolve("cancel");
  };

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogContent className='gap-0 overflow-hidden p-0 sm:max-w-2xl'>
        <div className='flex items-start gap-3 border-b border-border/60 bg-muted/30 px-6 pt-5 pb-4'>
          <Avatar className='size-10 ring-1 ring-border/60'>
            {heroImage && <AvatarImage alt={heroName} src={heroImage} />}
            <AvatarFallback className='text-sm'>{heroInitial}</AvatarFallback>
          </Avatar>
          <div className='flex min-w-0 flex-col gap-0.5'>
            <AlertDialogTitle className='text-base'>
              {t("heroConflict.title", { heroName })}
            </AlertDialogTitle>
            <AlertDialogDescription className='text-pretty text-sm'>
              {t("heroConflict.description")}
            </AlertDialogDescription>
          </div>
        </div>

        <div className='px-6 py-5 [--hero-swap-gap:1.5rem]'>
          <div className='grid grid-cols-[1fr_auto_1fr] items-stretch gap-6'>
            <div
              className={cn(
                "flex flex-col gap-2",
                phase === "swapping" && "hero-swap-left",
              )}
              onAnimationEnd={
                phase === "swapping" ? resolveSwapOnce : undefined
              }>
              <SlotHeader label={t("heroConflict.currentlyActive")} />
              <div className='flex-1'>
                <ModCard mod={currentMod ?? undefined} readOnly />
              </div>
            </div>

            <div className='flex items-center'>
              <div className='flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground'>
                <ArrowLeftRight className='size-4 shrink-0' />
              </div>
            </div>

            <div
              className={cn(
                "flex flex-col gap-2",
                phase === "swapping" && "hero-swap-right",
              )}>
              <SlotHeader label={t("heroConflict.switchingTo")} />
              <div className='flex-1'>
                <ModCard mod={newMod ?? undefined} readOnly />
              </div>
            </div>
          </div>
        </div>

        <div className='flex flex-col-reverse gap-3 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between'>
          <Button
            disabled={phase === "swapping"}
            onClick={() => onResolve("cancel")}
            size='sm'
            type='button'
            variant='ghost'>
            {t("heroConflict.cancel")}
          </Button>
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:items-center'>
            <Button
              disabled={phase === "swapping"}
              onClick={() => onResolve("enable-both")}
              size='sm'
              title={t("heroConflict.keepBothHint")}
              type='button'
              variant='outline'>
              <TriangleAlert className='size-4 shrink-0' />
              {t("heroConflict.keepBothAction")}
            </Button>
            <Button
              disabled={phase === "swapping"}
              onClick={handleSwap}
              size='sm'
              type='button'>
              <ArrowLeftRight className='size-4 shrink-0' />
              {t("heroConflict.swapAction")}
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const SlotHeader = ({ label }: { label: string }) => (
  <p className='font-medium text-muted-foreground text-xs uppercase tracking-wide'>
    {label}
  </p>
);
