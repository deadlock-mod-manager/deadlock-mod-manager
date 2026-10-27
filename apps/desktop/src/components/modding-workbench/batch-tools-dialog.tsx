import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import type { ModdingImageInput } from "@/types/generated/ModdingImageInput";
import type { ModdingImageBuild } from "@/types/generated/ModdingImageBuild";
import type { ModdingBatchPlan } from "@/types/generated/ModdingBatchPlan";
import { RenamePreview } from "./rename-preview";

interface Props {
  addon: ModdingAddon;
  hierarchy: ModdingHierarchy;
  onClose: () => void;
  onChanged: () => void;
}
export const BatchToolsDialog = (props: Props) => {
  const { t } = useTranslation();
  const busy =
    useIsMutating({ mutationKey: ["workbench-files-change", props.addon.id] }) +
      useIsMutating({ mutationKey: ["workbench-build"] }) >
    0;
  const files = useQuery({
    queryKey: ["workbench-batch-files", props.addon.id, props.hierarchy],
    queryFn: () =>
      invoke<string[]>("list_modding_batch_files", {
        addonId: props.addon.id,
        hierarchy: props.hierarchy,
      }),
  });
  const images = useQuery({
    queryKey: ["workbench-image-inputs", props.addon.id],
    queryFn: () =>
      invoke<ModdingImageInput[]>("list_modding_image_inputs", {
        addonId: props.addon.id,
      }),
    enabled: props.hierarchy === "content",
  });
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !busy) props.onClose();
      }}>
      <DialogContent className='flex h-[85vh] max-w-5xl flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle>{t("workbenchAuthoring.batchTools")}</DialogTitle>
          <DialogDescription>
            {props.addon.name} · {props.hierarchy}
          </DialogDescription>
        </DialogHeader>
        {files.data && (props.hierarchy === "game" || images.data) ? (
          <BatchTools
            {...props}
            files={files.data}
            images={images.data ?? []}
          />
        ) : (
          <p role={files.error || images.error ? "alert" : "status"}>
            {files.error?.message ??
              images.error?.message ??
              t("common.loading")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
interface FormProps extends Props {
  files: string[];
  images: ModdingImageInput[];
}
const BatchTools = ({
  addon,
  hierarchy,
  onChanged,
  files,
  images,
}: FormProps) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [mode, setMode] = useState<"images" | "rename" | "audio">(
    hierarchy === "content" ? "images" : "rename",
  );
  const [selected, setSelected] = useState(
    new Set(images.map((input) => input.path)),
  );
  const [outputs, setOutputs] = useState(
    new Map(images.map((input) => [input.path, input.output])),
  );
  const [scope, setScope] = useState("");
  const [filter, setFilter] = useState("");
  const [find, setFind] = useState("_png");
  const [replacement, setReplacement] = useState("");
  const [references, setReferences] = useState(false);
  const [backup, setBackup] = useState("");
  const changed = async () => {
    onChanged();
    await Promise.all([
      client.invalidateQueries({ queryKey: ["workbench-files", addon.id] }),
      client.invalidateQueries({
        queryKey: ["workbench-batch-files", addon.id],
      }),
      client.invalidateQueries({
        queryKey: ["workbench-image-inputs", addon.id],
      }),
    ]);
  };
  const paths = [...selected];
  const request = {
    paths,
    find,
    replace: replacement,
    updateSourceReferences: references,
  };
  const preview = useMutation({
    mutationFn: () =>
      invoke<ModdingBatchPlan>("plan_modding_rename", {
        addonId: addon.id,
        hierarchy,
        request,
      }),
  });
  const apply = useMutation({
    mutationKey: ["workbench-files-change", addon.id],
    mutationFn: async () => {
      if (!preview.data) return;
      const id = await invoke<string>("apply_modding_rename", {
        addonId: addon.id,
        hierarchy,
        request,
        fingerprint: preview.data.fingerprint,
      });
      setBackup(id);
      setSelected(new Set());
      preview.reset();
      await changed();
      return id;
    },
  });
  const compile = useMutation({
    mutationKey: ["workbench-build"],
    mutationFn: () =>
      invoke<ModdingImageBuild>("compile_modding_images", {
        addonId: addon.id,
        inputs: images
          .filter((input) => selected.has(input.path))
          .map((input) => ({
            path: input.path,
            output: outputs.get(input.path) ?? input.output,
          })),
      }),
    onSuccess: changed,
  });
  const audio = useMutation({
    mutationKey: ["workbench-files-change", addon.id],
    mutationFn: async () => {
      const sourcePath = await open({
        multiple: false,
        filters: [
          {
            name: t("workbenchAuthoring.audioFiles"),
            extensions: ["mp3", "wav"],
          },
        ],
      });
      if (!sourcePath) return;
      const id = await invoke<string>("replace_modding_audio_batch", {
        addonId: addon.id,
        paths,
        sourcePath,
      });
      setBackup(id);
      await changed();
      await invoke("compile_modding_addon", { addonId: addon.id });
      return { backupId: id, count: paths.length };
    },
  });
  const undo = useMutation({
    mutationKey: ["workbench-files-change", addon.id],
    mutationFn: () =>
      invoke("undo_modding_edit", {
        addonId: addon.id,
        hierarchy,
        backupId: backup,
      }),
    onSuccess: async () => {
      setBackup("");
      preview.reset();
      await changed();
    },
  });
  const busy =
    preview.isPending ||
    apply.isPending ||
    compile.isPending ||
    audio.isPending ||
    undo.isPending;
  const candidates =
    mode === "images"
      ? images.map((input) => input.path)
      : mode === "audio"
        ? files.filter((path) => /\.(mp3|wav)$/i.test(path))
        : files;
  const visible = candidates.filter(
    (path) =>
      (!scope ||
        path === scope ||
        path.startsWith(`${scope.replace(/\/$/, "")}/`)) &&
      path.toLowerCase().includes(filter.toLowerCase()),
  );
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => (mode === "images" ? 70 : 34),
    overscan: 8,
  });
  const resetPlan = () => {
    preview.reset();
    apply.reset();
  };
  const error =
    preview.error ?? apply.error ?? compile.error ?? audio.error ?? undo.error;
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex flex-wrap gap-1'>
        {(["images", "rename", "audio"] satisfies (typeof mode)[]).map(
          (value) => (
            <Button
              size='sm'
              key={value}
              variant={value === mode ? "secondary" : "ghost"}
              disabled={busy || (hierarchy === "game" && value !== "rename")}
              onClick={() => {
                setMode(value);
                setFilter("");
                compile.reset();
                audio.reset();
                setSelected(
                  new Set(
                    value === "images" ? images.map((input) => input.path) : [],
                  ),
                );
                resetPlan();
              }}>
              {t(`workbenchAuthoring.batch_${value}`)}
            </Button>
          ),
        )}
      </div>
      <p className='text-xs text-muted-foreground'>
        {t(`workbenchAuthoring.batchHint_${mode}`)}
      </p>
      <div className='flex gap-2'>
        <Input
          aria-label={t("workbenchAuthoring.folderScope")}
          placeholder={t("workbenchAuthoring.folderScope")}
          value={scope}
          disabled={busy}
          onChange={(event) => setScope(event.target.value)}
        />
        <Input
          aria-label={t("workbenchAuthoring.filterFiles")}
          placeholder={t("workbenchAuthoring.filterFiles")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div className='flex flex-wrap items-center gap-2 text-xs'>
        <Button
          size='sm'
          variant='outline'
          disabled={busy}
          onClick={() => {
            setSelected((previous) => new Set([...previous, ...visible]));
            resetPlan();
          }}>
          {t("workbenchAuthoring.selectVisible")}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy}
          onClick={() => {
            setSelected(new Set());
            resetPlan();
          }}>
          {t("workbenchExplorer.clearSelection")}
        </Button>
        <span>{t("workbenchExplorer.selected", { count: selected.size })}</span>
      </div>
      <div
        ref={scroll}
        className='min-h-24 flex-1 overflow-auto rounded border'>
        <div style={{ height: rows.getTotalSize(), position: "relative" }}>
          {rows.getVirtualItems().map((row) => {
            const path = visible[row.index];
            if (!path) return null;
            return (
              <div
                key={path}
                className='absolute left-0 top-0 flex w-full items-start gap-2 border-b px-3 py-2'
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}>
                <input
                  type='checkbox'
                  aria-label={t("workbenchAuthoring.selectFile", { path })}
                  checked={selected.has(path)}
                  disabled={busy}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (checked) next.add(path);
                      else next.delete(path);
                      return next;
                    });
                    resetPlan();
                  }}
                />
                <div className='min-w-0 flex-1'>
                  <p title={path} className='truncate font-mono text-xs'>
                    {path}
                  </p>
                  {mode === "images" ? (
                    <Input
                      className='mt-1 h-7 font-mono text-xs'
                      aria-label={t("workbenchAuthoring.outputPath", { path })}
                      value={outputs.get(path) ?? ""}
                      disabled={busy}
                      onChange={(event) =>
                        setOutputs((previous) =>
                          new Map(previous).set(path, event.target.value),
                        )
                      }
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {mode === "rename" ? (
        <>
          <div className='flex gap-2'>
            <Input
              aria-label={t("workbenchAuthoring.findName")}
              placeholder={t("workbenchAuthoring.findName")}
              value={find}
              disabled={busy}
              onChange={(event) => {
                setFind(event.target.value);
                resetPlan();
              }}
            />
            <Input
              aria-label={t("workbenchAuthoring.replaceName")}
              placeholder={t("workbenchAuthoring.replaceName")}
              value={replacement}
              disabled={busy}
              onChange={(event) => {
                setReplacement(event.target.value);
                resetPlan();
              }}
            />
          </div>
          <label className='flex gap-2 text-xs'>
            <input
              type='checkbox'
              checked={references}
              disabled={busy}
              onChange={(event) => {
                setReferences(event.target.checked);
                resetPlan();
              }}
            />
            {t("workbenchAuthoring.updateSourceReferences")}
          </label>
          {preview.data ? <RenamePreview plan={preview.data} /> : null}
        </>
      ) : null}
      <div className='flex flex-wrap gap-2'>
        {mode === "rename" ? (
          <>
            <Button
              variant='outline'
              disabled={!selected.size || busy || preview.isPending}
              onClick={() => preview.mutate()}>
              {t(
                preview.isPending
                  ? "workbenchAuthoring.checkingUsage"
                  : "workbenchAuthoring.previewRename",
              )}
            </Button>
            <Button
              disabled={
                busy || !preview.data || !!preview.data.conflicts.length
              }
              onClick={() => apply.mutate()}>
              {t("workbenchAuthoring.applyRename")}
            </Button>
          </>
        ) : mode === "images" ? (
          <Button
            disabled={!selected.size || busy}
            onClick={() => compile.mutate()}>
            {t(
              busy
                ? "workbenchExplorer.compilingOnly"
                : "workbenchAuthoring.compileImages",
            )}
          </Button>
        ) : (
          <Button
            disabled={!selected.size || busy}
            onClick={() => audio.mutate()}>
            {t(
              busy
                ? "workbenchExplorer.compilingOnly"
                : "workbenchAuthoring.replaceCompile",
            )}
          </Button>
        )}
        {backup ? (
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => undo.mutate()}>
            {t("workbenchAuthoring.undo")}
          </Button>
        ) : null}
      </div>
      {mode === "images" && compile.data ? (
        <p role='status' className='break-all text-xs'>
          {t("workbenchAuthoring.builtOutputs", {
            count: compile.data.outputs.length,
          })}{" "}
          {compile.data.logPath}
        </p>
      ) : null}
      {mode === "audio" && audio.data ? (
        <p role='status' className='text-xs'>
          {t("workbenchAuthoring.audioBuilt", { count: audio.data.count })}
        </p>
      ) : null}
      {backup ? (
        <p className='text-xs text-muted-foreground'>
          {t("workbenchAuthoring.backupSaved", {
            path: `.dmm-history/${backup}`,
          })}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error.message}
        </p>
      ) : null}
    </div>
  );
};
