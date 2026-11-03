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
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { NativeSourceInstallation } from "@/types/generated/NativeSourceInstallation";

interface NativeSourceSelectionDialogProps {
  installation: NativeSourceInstallation;
  modName: string;
  selectedComponentIds?: string[];
  onConfirm: (componentIds: string[]) => Promise<void>;
  onCancel: () => void;
}

export const NativeSourceSelectionDialog = ({
  installation,
  modName,
  selectedComponentIds,
  onConfirm,
  onCancel,
}: NativeSourceSelectionDialogProps) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(
    () =>
      new Set([
        ...installation.requiredComponents,
        ...(
          selectedComponentIds ??
          installation.choiceGroups.flatMap(
            (group) => group.defaultComponentIds,
          )
        ).filter((id) =>
          installation.components.some((component) => component.id === id),
        ),
      ]),
  );
  const confirm = useMutation({
    mutationFn: () => onConfirm([...selected]),
    meta: { skipGlobalErrorHandler: true },
  });
  const valid =
    selected.size > 0 &&
    installation.choiceGroups.every((group) => {
      const count = group.componentIds.filter((id) => selected.has(id)).length;
      return count >= group.minSelections && count <= group.maxSelections;
    });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !confirm.isPending) onCancel();
      }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("modSources.selectComponents")}: {modName}
          </DialogTitle>
          <DialogDescription>
            {t("modSources.selectComponentsDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-80 space-y-4 overflow-y-auto'>
          {installation.choiceGroups.map((group) => (
            <fieldset className='space-y-2' key={group.id}>
              <legend className='text-sm font-medium'>
                {group.label}{" "}
                <span className='text-xs text-muted-foreground'>
                  (
                  {t("modSources.componentGroup", {
                    min: group.minSelections,
                    max: group.maxSelections,
                  })}
                  )
                </span>
              </legend>
              {group.componentIds.map((id) => {
                const component = installation.components.find(
                  (item) => item.id === id,
                );
                const required = installation.requiredComponents.includes(id);
                return (
                  <label
                    className='flex cursor-pointer items-center gap-2 text-sm'
                    key={id}>
                    <Checkbox
                      checked={selected.has(id)}
                      disabled={required || confirm.isPending}
                      onCheckedChange={(checked) =>
                        setSelected((previous) => {
                          const next = new Set(previous);
                          if (checked === true) {
                            if (group.maxSelections === 1)
                              group.componentIds.forEach((otherId) => {
                                if (
                                  !installation.requiredComponents.includes(
                                    otherId,
                                  )
                                )
                                  next.delete(otherId);
                              });
                            next.add(id);
                          } else next.delete(id);
                          return next;
                        })
                      }
                    />
                    {component?.label ?? id}
                    {required && (
                      <span className='text-xs text-muted-foreground'>
                        {t("modSources.required")}
                      </span>
                    )}
                  </label>
                );
              })}
            </fieldset>
          ))}
          {installation.requiredComponents
            .filter(
              (id) =>
                !installation.choiceGroups.some((group) =>
                  group.componentIds.includes(id),
                ),
            )
            .map((id) => (
              <p className='text-sm text-muted-foreground' key={id}>
                {installation.components.find(
                  (component) => component.id === id,
                )?.label ?? id}{" "}
                · {t("modSources.required")}
              </p>
            ))}
        </div>
        {confirm.error && (
          <p role='alert' className='text-sm text-destructive'>
            {confirm.error.message}
          </p>
        )}
        <DialogFooter>
          <Button
            variant='outline'
            disabled={confirm.isPending}
            onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!valid || confirm.isPending}
            isLoading={confirm.isPending}
            onClick={() => confirm.mutate()}>
            {t("modSources.confirmSelection")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
