import { PlusIcon, ImageIcon } from "@phosphor-icons/react";
import { Button } from "@deadlock-mods/ui/components/button";
import { useMutation, useQueries } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import type { ModdingModelImage } from "@/types/generated/ModdingModelImage";
import type { ModdingModelImagePixels } from "@/types/generated/ModdingModelImagePixels";
import type {
  ModelPatchRuntime,
  ModelPatchSelection,
} from "@/lib/model-patch-runtime";
import { decodeModelImageFrames } from "@/lib/model-image-layer-data";

import { ModelStickerInspector } from "./model-sticker-inspector";

export function ModelAttachedStickers({
  active,
  addonId,
  material,
  edits,
  disabled,
  supported,
  runtime,
  onChange,
  onActiveChange,
}: {
  active: boolean;
  addonId: string;
  material: string;
  edits: readonly ModdingModelPartEdit[];
  disabled: boolean;
  supported: boolean;
  runtime: RefObject<ModelPatchRuntime | null>;
  onChange: (material: string, patches: ModdingModelPatch[]) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<ModelPatchSelection>(null);
  const [fitRequest, setFitRequest] =
    useState<ModelPatchRuntime["fitRequest"]>(null);
  const fit = (id: string) =>
    setFitRequest((previous) => ({
      id,
      revision: (previous?.revision ?? 0) + 1,
    }));
  const entries = useMemo(
    () =>
      edits.flatMap((edit) =>
        (edit.patches ?? []).map((patch) => ({
          material: edit.material,
          patch,
          hidden: edit.hidden,
        })),
      ),
    [edits],
  );
  const sourcePaths = [
    ...new Set([
      ...entries.map((entry) => entry.patch.image),
      ...(selection?.kind === "placing" ? [selection.patch.image] : []),
    ]),
  ];
  const sources = useQueries({
    queries: sourcePaths.map((path) => ({
      queryKey: ["workbench-sticker-image", addonId, path],
      queryFn: async () => {
        const data = await invoke<ModdingModelImagePixels>(
          "read_modding_model_image",
          { addonId, path, maxSide: 512 },
        );
        return { path, frames: decodeModelImageFrames(data.frames), plays: 0 };
      },
      staleTime: Infinity,
      gcTime: 60_000,
    })),
  });
  const images = new Map(
    sources.flatMap((source) =>
      source.data
        ? [
            [source.data.path, source.data] satisfies [
              string,
              typeof source.data,
            ],
          ]
        : [],
    ),
  );
  const partPatches =
    edits.find((edit) => edit.material === material)?.patches ?? [];
  const selected =
    selection?.kind === "selected"
      ? partPatches.find((p) => p.id === selection.id)
      : undefined;
  const cancel = () => {
    setSelection(null);
    onActiveChange(false);
  };
  const place = (host: string, patch: ModdingModelPatch) => {
    const current = edits.find((edit) => edit.material === host)?.patches ?? [];
    onChange(
      host,
      current.some((p) => p.id === patch.id)
        ? current.map((p) => (p.id === patch.id ? patch : p))
        : [...current, patch],
    );
    setSelection({ kind: "selected", id: patch.id, mode: "translate" });
    onActiveChange(false);
  };
  useEffect(() => {
    runtime.current = {
      entries,
      images,
      selection: active ? selection : null,
      fitRequest,
      onPlace: place,
      onChange: (host, patch) => {
        const current =
          edits.find((edit) => edit.material === host)?.patches ?? [];
        onChange(
          host,
          current.map((p) => (p.id === patch.id ? patch : p)),
        );
      },
      onCancel: cancel,
      onManipulating: onActiveChange,
    };
    return () => {
      runtime.current = null;
    };
  });
  useEffect(() => {
    setSelection(null);
    onActiveChange(false);
  }, [material, onActiveChange]);
  useEffect(() => () => onActiveChange(false), [onActiveChange]);
  const importing = useMutation({
    mutationKey: ["workbench-import-sticker", addonId, material],
    mutationFn: async () => {
      const path = await open({
        multiple: false,
        filters: [
          {
            name: t("modelEditor.stickers.imageFiles"),
            extensions: ["png", "gif", "jpg", "jpeg", "webp", "tga", "bmp"],
          },
        ],
      });
      if (!path) return null;
      return invoke<ModdingModelImage>("import_modding_model_image", {
        addonId,
        path,
      });
    },
    onSuccess: (source) => {
      if (!source) return;
      const patch: ModdingModelPatch = {
        id: crypto.randomUUID(),
        image: source.path,
        bone: "",
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        size: [
          20,
          Math.max(0.01, Math.min(1000, (20 * source.height) / source.width)),
        ],
        shape: "conform",
        conformity: 1,
        curvature: 0.03,
        thickness: 0.1,
        offset: 0.3,
        roughness: 0.75,
        glow: 0,
        crop: [0, 0, 1, 1],
        background: null,
      };
      setSelection({ kind: "placing", material, patch });
      onActiveChange(true);
    },
  });
  const busy = disabled || !supported || importing.isPending;
  const change = (patch: ModdingModelPatch) => {
    if (
      patch.shape === "conform" &&
      (selected?.shape !== "conform" ||
        patch.size.some((size, i) => size !== selected?.size[i]))
    )
      fit(patch.id);
    onChange(
      material,
      partPatches.map((p) => (p.id === patch.id ? patch : p)),
    );
  };
  const error =
    importing.error ?? sources.find((source) => source.error)?.error;
  return (
    <section className='py-4'>
      <div className='flex items-center justify-between gap-2'>
        <h4 className='flex min-w-0 items-center gap-2 text-xs font-medium'>
          {t("modelEditor.inspector.stickerList")}
          <span className='rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground'>
            {partPatches.length}
          </span>
        </h4>
        <Button
          size='sm'
          variant='outline'
          className='h-8 shrink-0 gap-1.5 text-xs'
          disabled={
            busy || entries.length >= 8 || selection?.kind === "placing"
          }
          aria-label={t("modelEditor.stickers.add")}
          onClick={() => importing.mutate()}>
          <PlusIcon className='size-3.5' />
          {t(
            importing.isPending
              ? "modelEditor.stickers.importing"
              : "modelEditor.inspector.addSticker",
          )}
        </Button>
      </div>
      <div className='mt-3 space-y-3'>
        {(!partPatches.length || !supported) && (
          <p className='text-[11px] leading-relaxed text-muted-foreground'>
            {t(
              supported
                ? "modelEditor.stickers.description"
                : "modelEditor.stickers.unsupported",
            )}
          </p>
        )}
        {selection?.kind === "placing" && (
          <div
            role='status'
            className='space-y-2 rounded border bg-muted/40 p-2'>
            <p className='text-xs'>{t("modelEditor.stickers.placeHint")}</p>
            <Button size='sm' variant='outline' onClick={cancel}>
              {t("modelEditor.stickers.cancel")}
            </Button>
          </div>
        )}
        {error && (
          <p role='alert' className='text-xs text-destructive'>
            {error.message}
          </p>
        )}
        {partPatches.length > 0 && (
          <div className='space-y-1'>
            {partPatches.map((patch, index) => (
              <button
                key={patch.id}
                type='button'
                aria-pressed={selected?.id === patch.id}
                className='flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2.5 text-left text-xs hover:bg-muted aria-pressed:border-primary/30 aria-pressed:bg-accent'
                onClick={() =>
                  setSelection({
                    kind: "selected",
                    id: patch.id,
                    mode: "translate",
                  })
                }>
                <span className='flex min-w-0 items-center gap-2'>
                  <ImageIcon className='size-4 shrink-0 text-muted-foreground' />
                  {t("modelEditor.stickers.item", { number: index + 1 })}
                </span>
                <span className='max-w-32 truncate font-mono text-[10px] text-muted-foreground'>
                  {patch.bone || t("modelEditor.stickers.static")}
                </span>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <ModelStickerInspector
            selected={selected}
            activeMode={
              selection?.kind === "selected" ? selection.mode : "translate"
            }
            busy={busy}
            image={images.get(selected.image)}
            onChange={change}
            onFit={() => fit(selected.id)}
            onModeChange={(mode) =>
              setSelection({ kind: "selected", id: selected.id, mode })
            }
            onReposition={() => {
              setSelection({ kind: "placing", material, patch: selected });
              onActiveChange(true);
            }}
            onDone={cancel}
            onRemove={() => {
              onChange(
                material,
                partPatches.filter((p) => p.id !== selected.id),
              );
              cancel();
            }}
          />
        )}
      </div>
    </section>
  );
}
