import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Label } from "@deadlock-mods/ui/components/label";
import { Play, Wrench } from "@deadlock-mods/ui/icons";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { ModHealth } from "@/types/generated/ModHealth";
import { SymptomBadge } from "./mod-health-badge";

export type LaunchFixChoice = "fix" | "launch" | "cancel";

export const LaunchFixDialog = ({
  count,
  onChoose,
}: {
  count: number;
  onChoose: (choice: LaunchFixChoice) => void;
}) => {
  const { t } = useTranslation();
  const checkboxId = useId();
  const setAutoFixMods = usePersistedStore((state) => state.setAutoFixMods);
  const [alwaysFix, setAlwaysFix] = useState(false);

  const choose = (choice: Exclude<LaunchFixChoice, "cancel">) => {
    if (alwaysFix && choice === "fix") setAutoFixMods(true);
    onChoose(choice);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onChoose("cancel");
      }}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {t("modHealth.launchPrompt.title", { count })}
          </DialogTitle>
          <DialogDescription>
            {t("modHealth.launchPrompt.description")}
          </DialogDescription>
        </DialogHeader>
        <div className='flex items-center gap-2'>
          <Checkbox
            id={checkboxId}
            checked={alwaysFix}
            onCheckedChange={(checked) => setAlwaysFix(checked === true)}
          />
          <Label htmlFor={checkboxId} className='font-normal text-sm'>
            {t("modHealth.launchPrompt.alwaysFix")}
          </Label>
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            icon={<Play className='h-4 w-4' />}
            onClick={() => choose("launch")}>
            {t("modHealth.launchPrompt.launchAnyway")}
          </Button>
          <Button
            icon={<Wrench className='h-4 w-4' />}
            onClick={() => choose("fix")}>
            {t("modHealth.launchPrompt.fixAndLaunch")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export type HeldBackMod = { name: string; health: ModHealth };

/** Asks once about enabled mods that automatic fixes leave to the player. */
export const HeldBackFixDialog = ({
  mods,
  onChoose,
}: {
  mods: readonly HeldBackMod[];
  onChoose: (choice: LaunchFixChoice) => void;
}) => {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onChoose("cancel");
      }}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {t("modHealth.heldBackPrompt.title", { count: mods.length })}
          </DialogTitle>
          <DialogDescription>
            {t("modHealth.heldBackPrompt.description")}
          </DialogDescription>
        </DialogHeader>
        <ul className='flex max-h-72 flex-col gap-3 overflow-y-auto'>
          {mods.map(({ name, health }) => (
            <li key={health.modId} className='flex flex-col gap-1.5'>
              <span className='font-medium text-sm'>{name}</span>
              <div className='flex flex-wrap gap-1.5'>
                {health.fixSymptoms.map((symptom) => (
                  <SymptomBadge
                    key={symptom}
                    symptom={symptom}
                    className='text-muted-foreground'
                  />
                ))}
                {health.remainingSymptoms.map((symptom) => (
                  <SymptomBadge
                    key={symptom}
                    symptom={symptom}
                    className='border-amber-400/25 text-amber-200/80'
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            variant='outline'
            icon={<Play className='h-4 w-4' />}
            onClick={() => onChoose("launch")}>
            {t("modHealth.heldBackPrompt.launchWithoutFixing")}
          </Button>
          <Button
            icon={<Wrench className='h-4 w-4' />}
            onClick={() => onChoose("fix")}>
            {t("modHealth.launchPrompt.fixAndLaunch")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
