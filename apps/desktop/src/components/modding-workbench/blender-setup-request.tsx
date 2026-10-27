import { Button } from "@deadlock-mods/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { BlenderAddonStatus } from "@/types/generated/BlenderAddonStatus";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";

interface BlenderSetupRequestProps {
  addonId: string;
  hierarchy: ModdingHierarchy;
  path: string;
  status: BlenderAddonStatus;
  onClose: () => void;
  onConfigured?: () => void;
}

export const BlenderSetupRequest = ({
  status,
  onClose,
  onConfigured,
  ...file
}: BlenderSetupRequestProps) => {
  const { t } = useTranslation();
  const setup = useMutation({
    mutationFn: async () => {
      await invoke<BlenderAddonStatus>("install_modding_blender_addon");
      const result = onConfigured
        ? await invoke<BlenderAddonStatus>("inspect_modding_blender")
        : await invoke<BlenderAddonStatus>("open_modding_blender", file);
      if (!result.ready)
        throw new Error(t("workbenchExplorer.blenderSetupFailed"));
    },
    onSuccess: onConfigured ?? onClose,
  });
  return (
    <div
      className='space-y-2 border-t p-3'
      role='region'
      aria-label={t("workbenchExplorer.blenderSetup")}>
      <p className='text-sm font-medium'>
        {t("workbenchExplorer.blenderSetup")}
      </p>
      <p className='break-all font-mono text-xs text-muted-foreground'>
        {file.path}
      </p>
      <p className='text-xs text-muted-foreground'>
        {status.installSupported
          ? t(
              onConfigured
                ? "workbenchExplorer.blenderPreviewSetupDescription"
                : "workbenchExplorer.blenderSetupDescription",
            )
          : t("workbenchExplorer.blenderUpgrade", {
              version: status.blenderVersion,
            })}
      </p>
      <div className='flex flex-wrap gap-2'>
        {status.installSupported ? (
          <Button
            size='sm'
            disabled={setup.isPending}
            onClick={() => setup.mutate()}>
            {t(
              setup.isPending
                ? "workbenchExplorer.installingBlenderAddon"
                : "workbenchExplorer.installBlenderAddon",
            )}
          </Button>
        ) : null}
        <Button
          size='sm'
          variant='ghost'
          disabled={setup.isPending}
          onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
      {setup.error ? (
        <p role='alert' className='text-xs text-destructive'>
          {setup.error.message}
        </p>
      ) : null}
    </div>
  );
};
