import { Button } from "@deadlock-mods/ui/components/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FoundryModelViewer } from "@/components/foundry/foundry-model-viewer";
import { cacheFoundryModel, decodeModdingDmx } from "@/lib/model-assets";
import type { BlenderAddonStatus } from "@/types/generated/BlenderAddonStatus";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import { BlenderSetupRequest } from "./blender-setup-request";

interface Props {
  addonId: string;
  hierarchy: ModdingHierarchy;
  path: string;
  revision: number;
}

export const AddonDmxPreview = ({ revision, ...file }: Props) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const fullscreen = useRef<HTMLDivElement>(null);
  const [showSetup, setShowSetup] = useState(true);
  const status = useQuery({
    queryKey: ["workbench-blender-status"],
    queryFn: () => invoke<BlenderAddonStatus>("inspect_modding_blender"),
    staleTime: 0,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const key = [
    "workbench-dmx",
    file.addonId,
    file.hierarchy,
    file.path,
    revision,
  ];
  const model = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const result = await decodeModdingDmx(
        file.addonId,
        file.hierarchy,
        file.path,
        signal,
      );
      cacheFoundryModel(client, key, result);
      return result;
    },
    enabled: status.data?.ready === true,
    gcTime: 0,
    staleTime: 60_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  if (status.data && !status.data.ready) {
    return showSetup ? (
      <BlenderSetupRequest
        {...file}
        status={status.data}
        onClose={() => setShowSetup(false)}
        onConfigured={() => void status.refetch()}
      />
    ) : (
      <Button variant='outline' onClick={() => setShowSetup(true)}>
        {t("workbenchExplorer.blenderSetup")}
      </Button>
    );
  }
  const error = status.error ?? model.error;
  return (
    <div ref={fullscreen} className='flex h-full min-h-0 flex-col'>
      <div className='min-h-0 flex-1'>
        {model.data ? (
          <FoundryModelViewer
            model={model.data}
            label={file.path}
            fullscreenTarget={fullscreen}
          />
        ) : (
          <p
            role={error ? "alert" : "status"}
            className='p-4 text-sm text-muted-foreground'>
            {error?.message ?? t("workbenchExplorer.readingDmx")}
          </p>
        )}
      </div>
      <p className='border-t px-3 py-2 text-xs text-muted-foreground'>
        {t("workbenchExplorer.dmxPreviewDescription")}
      </p>
    </div>
  );
};
