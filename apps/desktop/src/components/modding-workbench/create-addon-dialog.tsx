import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
export const CreateAddonDialog = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (addon: ModdingAddon) => void;
}) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => invoke<ModdingAddon>("create_modding_addon", { name }),
    onSuccess: async (addon) => {
      await client.invalidateQueries({ queryKey: ["workbench-addons"] });
      onCreated(addon);
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !create.isPending) onClose();
      }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workbenchAuthoring.createAddon")}</DialogTitle>
          <DialogDescription>
            {t("workbenchAuthoring.addonNameHint")}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-3'
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}>
          <Input
            aria-label={t("workbenchAuthoring.addonName")}
            value={name}
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            disabled={create.isPending}
          />
          <Button
            type='submit'
            disabled={create.isPending || !/^[a-z0-9_]{1,64}$/.test(name)}>
            {t("workbenchAuthoring.createAddon")}
          </Button>
          {create.error ? (
            <p role='alert' className='text-sm text-destructive'>
              {create.error.message}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
};
