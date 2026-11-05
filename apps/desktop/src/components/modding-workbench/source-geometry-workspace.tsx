import { Button } from "@deadlock-mods/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { cacheFoundryModel, decodeModdingDmx } from "@/lib/model-assets";
import type { ModdingGeometry } from "@/types/generated/ModdingGeometry";
import type { ModdingGeometrySource } from "@/types/generated/ModdingGeometrySource";
import { SourceGeometryEditor } from "./source-geometry-editor";

interface Props {
  addonId: string;
  path: string;
  revision: number;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
}

export function SourceGeometryWorkspace(props: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const { onDirtyChange } = props;
  const reportDirty = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange?.(value);
    },
    [onDirtyChange],
  );
  const [selection, setSelection] = useState("");
  const [localRevision, setLocalRevision] = useState(0);
  const [backup, setBackup] = useState<string | null>(null);
  const sources = useQuery({
    queryKey: [
      "workbench-geometry-sources",
      props.addonId,
      props.path,
      props.revision,
    ],
    queryFn: () =>
      invoke<ModdingGeometrySource[]>("list_modding_geometry_sources", {
        addonId: props.addonId,
        path: props.path,
      }),
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const path =
    sources.data?.find((source) => source.path === selection)?.path ??
    sources.data?.[0]?.path ??
    "";
  const key = [
    "workbench-geometry",
    props.addonId,
    path,
    props.revision,
    localRevision,
  ];
  const geometry = useQuery({
    queryKey: key,
    queryFn: () =>
      invoke<ModdingGeometry>("read_modding_geometry", {
        addonId: props.addonId,
        path,
      }),
    enabled: !!path,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    meta: { skipGlobalErrorHandler: true },
  });
  const previewKey = [...key, "preview"];
  const preview = useQuery({
    queryKey: previewKey,
    queryFn: async ({ signal }) => {
      const model = await decodeModdingDmx(
        props.addonId,
        "content",
        path,
        signal,
        false,
      );
      cacheFoundryModel(client, previewKey, model);
      return model;
    },
    enabled: !!geometry.data,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    meta: { skipGlobalErrorHandler: true, foregroundPreview: true },
  });
  const refresh = () => {
    setLocalRevision((revision) => revision + 1);
    props.onDirtyChange?.(false);
    props.onSaved?.();
  };
  const undo = useMutation({
    mutationFn: () =>
      invoke("undo_modding_edit", {
        addonId: props.addonId,
        hierarchy: "content",
        backupId: backup,
      }),
    onSuccess: () => {
      setBackup(null);
      refresh();
    },
  });
  const error = sources.error ?? geometry.error ?? preview.error ?? undo.error;
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex shrink-0 items-center gap-3 border-b px-3 py-2'>
        <label className='flex min-w-0 flex-1 items-center gap-2 text-xs'>
          {t("geometry.selectSource")}
          <select
            className='h-8 min-w-0 flex-1 rounded border bg-background px-2 text-xs'
            value={path}
            disabled={dirty}
            onChange={(event) => {
              setSelection(event.currentTarget.value);
              setBackup(null);
            }}
            aria-label={t("geometry.selectSource")}>
            {sources.data?.map((source) => (
              <option key={source.path} value={source.path}>
                {source.name} · {source.path}
              </option>
            ))}
          </select>
        </label>
        {backup && (
          <Button
            size='sm'
            variant='outline'
            disabled={undo.isPending || dirty}
            onClick={() => undo.mutate()}>
            {t("geometry.undoSaved")}
          </Button>
        )}
      </div>
      {backup && (
        <p
          role='status'
          className='border-b px-3 py-2 text-xs text-muted-foreground'>
          {t("geometry.saved")}
        </p>
      )}
      <div className='min-h-0 flex-1'>
        {geometry.data && preview.data ? (
          <SourceGeometryEditor
            key={`${path}:${geometry.data.fingerprint}:${localRevision}`}
            addonId={props.addonId}
            path={path}
            geometry={geometry.data}
            model={preview.data}
            onDirtyChange={reportDirty}
            onSaved={(id) => {
              setBackup(id);
              refresh();
            }}
          />
        ) : (
          <div className='flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground'>
            <p role={error ? "alert" : "status"}>
              {error?.message ??
                (sources.data?.length === 0
                  ? t("geometry.noSources")
                  : t("geometry.loading"))}
            </p>
            {error && (
              <>
                <p className='max-w-md text-xs'>{t("geometry.unsupported")}</p>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    if (sources.error) void sources.refetch();
                    else if (geometry.error) void geometry.refetch();
                    else void preview.refetch();
                  }}>
                  {t("skins.preview.retry")}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
