import { Button } from "@deadlock-mods/ui/components/button";
import { ResourceReferenceView } from "./resource-reference-view";
import type { ModdingReference } from "@/types/generated/ModdingReference";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingResourceDocument } from "@/types/generated/ModdingResourceDocument";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import { ResourceEditor } from "./resource-editor";
interface Props {
  addonId?: string;
  archivePath: string;
  hierarchy: ModdingHierarchy;
  path: string;
  revision: number;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
}
export const ResourceInspector = (props: Props) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [reference, setReference] = useState<ModdingReference | null>(null);
  const [editingDocument, setEditingDocument] =
    useState<ModdingResourceDocument | null>(null);
  const [backup, setBackup] = useState("");
  const compile = useMutation({
    mutationKey: ["workbench-build", props.addonId],
    mutationFn: () =>
      invoke<string>("compile_modding_addon", { addonId: props.addonId }),
    onSuccess: () => props.onSaved?.(),
  });
  const saved = async (shouldCompile: boolean) => {
    if (shouldCompile) compile.mutate();
    await client.invalidateQueries({
      queryKey: ["workbench-resource", props.addonId],
    });
    props.onSaved?.();
  };
  const resource = useQuery({
    queryKey: [
      "workbench-resource",
      props.addonId ?? props.archivePath,
      props.hierarchy,
      props.path,
      props.revision,
    ],
    queryFn: () =>
      invoke<ModdingResourceDocument>("inspect_modding_resource", {
        addonId: props.addonId,
        archivePath: props.archivePath,
        hierarchy: props.hierarchy,
        path: props.path,
      }),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const document = editingDocument ?? resource.data;
  if (reference)
    return (
      <div className='flex h-full min-h-0 flex-col'>
        <Button size='sm' variant='ghost' onClick={() => setReference(null)}>
          {t("workbenchExplorer.backFolder")} · {props.path}
        </Button>
        <p className='break-all p-2 font-mono text-xs'>{reference.path}</p>
        <div className='min-h-0 flex-1'>
          <ResourceReferenceView
            reference={reference}
            addonId={props.addonId}
            archivePath={props.archivePath}
            onReference={setReference}
          />
        </div>
      </div>
    );
  return document ? (
    <div className='flex h-full min-h-0 flex-col'>
      {compile.error ? (
        <div className='shrink-0 border-b p-2'>
          <p
            role='alert'
            className='max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs text-destructive'>
            {compile.error.message}
          </p>
          <Button size='sm' variant='outline' onClick={() => compile.mutate()}>
            {t("workbenchAuthoring.retryCompile")}
          </Button>
        </div>
      ) : null}
      {compile.isPending ? (
        <p role='status' className='p-2 text-xs'>
          {t("workbenchExplorer.compilingOnly")}
        </p>
      ) : null}
      <ResourceEditor
        key={`${props.path}:${document.fingerprint}`}
        document={document}
        addonId={props.addonId}
        path={props.path}
        onDirtyChange={(dirty) => {
          setEditingDocument(dirty ? document : null);
          props.onDirtyChange?.(dirty);
        }}
        onSaved={saved}
        backup={backup}
        onBackup={setBackup}
        onReference={setReference}
      />
    </div>
  ) : (
    <p role={resource.error ? "alert" : "status"} className='p-3 text-sm'>
      {resource.error?.message ?? t("common.loading")}
    </p>
  );
};
