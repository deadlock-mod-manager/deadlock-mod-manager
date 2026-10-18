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
