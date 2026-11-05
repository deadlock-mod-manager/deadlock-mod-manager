import { Button } from "@deadlock-mods/ui/components/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  cacheFoundryModel,
  inspectModdingModelEdits,
  MODEL_PREVIEW_GC_TIME,
} from "@/lib/model-assets";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import { ModelMaterialWorkspace } from "./model-material-workspace";

export function ModelMaterialEditor({
  addon,
  path,
  revision,
  onDirtyChange,
  onSaved,
}: {
  addon: ModdingAddon;
  path: string;
  revision: number;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = ["workbench-model-editor", addon.id, path, revision];
  const document = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const data = await inspectModdingModelEdits(addon.id, path, signal);
      cacheFoundryModel(client, key, data.model);
      return data;
    },
    gcTime: MODEL_PREVIEW_GC_TIME,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { skipGlobalErrorHandler: true, foregroundPreview: true },
  });
  return document.data ? (
    <ModelMaterialWorkspace
      key={document.data.fingerprint}
      addon={addon}
      path={path}
      document={document.data}
      onDirtyChange={onDirtyChange}
      onSaved={() => {
        onDirtyChange?.(false);
        if (onSaved) onSaved();
        else void document.refetch();
      }}
    />
  ) : (
    <div className='flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground'>
      <p role={document.error ? "alert" : "status"}>
        {document.error?.message ?? t("modelEditor.loading")}
      </p>
      {document.error ? (
        <>
          <p className='max-w-md text-xs'>{t("modelEditor.compileHint")}</p>
          <Button
            size='sm'
            variant='outline'
            onClick={() => void document.refetch()}>
            {t("skins.preview.retry")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
