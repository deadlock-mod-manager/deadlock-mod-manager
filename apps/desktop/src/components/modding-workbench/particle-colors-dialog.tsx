import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import { ParticleColorWorkspace } from "./particle-color-workspace";

export function ParticleColorsDialog({
  addon,
  initialPath,
  onClose,
  onSaved,
}: {
  addon: ModdingAddon;
  initialPath?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [dirty, setDirty] = useState(false);
  const files = useQuery({
    queryKey: ["workbench-particle-colors", addon.id],
    queryFn: () =>
      invoke<ModdingParticleFile[]>("list_modding_particle_colors", {
        addonId: addon.id,
        scope: "",
      }),
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (dirty) toast.error(t("particleColors.closeGuard"));
          else onClose();
        }
      }}>
      <DialogContent
        className='flex h-[90vh] w-[1600px] max-w-[96vw] flex-col overflow-hidden'
        aria-describedby='particle-colors-description'>
        <DialogHeader>
          <DialogTitle>{t("particleColors.title")}</DialogTitle>
          <DialogDescription id='particle-colors-description'>
            {addon.name} · {t("workbenchExplorer.content")} ·{" "}
            {t("particleColors.fileCount", { count: files.data?.length ?? 0 })}
          </DialogDescription>
        </DialogHeader>
        {files.data?.length ? (
          <ParticleColorWorkspace
            addon={addon}
            files={files.data}
            initialPath={initialPath}
            onDirtyChange={setDirty}
            onSaved={onSaved}
          />
        ) : (
          <p
            role={files.error ? "alert" : "status"}
            className='p-4 text-sm text-muted-foreground'>
            {files.error?.message ??
              t(files.isPending ? "common.loading" : "particleColors.empty")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
