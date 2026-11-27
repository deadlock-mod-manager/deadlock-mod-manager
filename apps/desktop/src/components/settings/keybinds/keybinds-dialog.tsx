import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { RotateCcw } from "@deadlock-mods/ui/icons";
import { platform } from "@tauri-apps/plugin-os";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeybindRow } from "@/components/settings/keybinds/keybind-row";
import { KeyCombo } from "@/components/shared/key-combo";
import { useResolvedKeybinds } from "@/hooks/use-keybinds";
import {
  defaultComboFor,
  findActionForCombo,
  KEYBIND_ACTIONS,
  KEYBIND_CATEGORIES,
  KEYBIND_DEFINITIONS,
  type KeybindAction,
  type KeyCombo as Combo,
} from "@/lib/keybinds";
import { usePersistedStore } from "@/lib/store";

type KeybindsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const KeybindsDialog = ({ open, onOpenChange }: KeybindsDialogProps) => {
  const { t } = useTranslation();
  const keybinds = useResolvedKeybinds();
  const overrides = usePersistedStore((s) => s.keybindOverrides);
  const setKeybind = usePersistedStore((s) => s.setKeybind);
  const resetKeybind = usePersistedStore((s) => s.resetKeybind);
  const resetAllKeybinds = usePersistedStore((s) => s.resetAllKeybinds);
  const [recording, setRecording] = useState<KeybindAction | null>(null);
  const hasOverrides = Object.keys(overrides).length > 0;

  const assign = (action: KeybindAction, combo: Combo | null) => {
    const previousOwner = combo && findActionForCombo(keybinds, combo);
    if (previousOwner && previousOwner !== action) {
      setKeybind(previousOwner, null);
      toast.info(
        t("keybinds.reassigned", {
          action: t(`keybinds.actions.${previousOwner}`),
        }),
      );
    }
    if (combo === defaultComboFor(action, platform())) {
      resetKeybind(action);
    } else {
      setKeybind(action, combo);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setRecording(null);
    onOpenChange(next);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-4xl'
        onEscapeKeyDown={(event) => {
          // Esc cancels the recording instead of closing the dialog.
          if (recording) event.preventDefault();
        }}>
        <DialogHeader className='border-b px-6 pt-6 pb-4'>
          <DialogTitle>{t("keybinds.title")}</DialogTitle>
          <DialogDescription>{t("keybinds.description")}</DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5'>
          {KEYBIND_CATEGORIES.map((category) => (
            <section className='space-y-2' key={category}>
              <h4 className='font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-wider'>
                {t(`keybinds.categories.${category}`)}
              </h4>
              <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                {KEYBIND_ACTIONS.filter(
                  (action) => KEYBIND_DEFINITIONS[action].category === category,
                ).map((action) => (
                  <KeybindRow
                    action={action}
                    combo={keybinds.get(action) ?? null}
                    isCustomized={overrides[action] !== undefined}
                    key={action}
                    onChange={(combo) => assign(action, combo)}
                    onRecordingChange={(active) =>
                      setRecording(active ? action : null)
                    }
                    onReset={() =>
                      assign(action, defaultComboFor(action, platform()))
                    }
                    recording={recording === action}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <DialogFooter className='items-center border-t px-6 py-4 sm:justify-between'>
          <p className='flex items-center gap-1.5 text-muted-foreground text-xs'>
            <KeyCombo combo='Alt' />
            {t("keybinds.menuBarHint")}
          </p>
          <div className='flex gap-2'>
            <Button
              disabled={!hasOverrides}
              onClick={resetAllKeybinds}
              size='sm'
              variant='outline'>
              <RotateCcw className='size-3.5' />
              {t("keybinds.resetAll")}
            </Button>
            <Button onClick={() => handleOpenChange(false)} size='sm'>
              {t("keybinds.done")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
