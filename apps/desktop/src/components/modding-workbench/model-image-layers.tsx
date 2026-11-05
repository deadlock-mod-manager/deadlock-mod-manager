import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { ValidationError } from "@deadlock-mods/common/client-errors";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import {
  defaultImageAlignment,
  fullImageCrop,
  trimModelImageFrames,
  type ModelImageAlignment,
} from "@/lib/model-image-placement";
import { ModelImagePlacement } from "./model-image-placement";
import {
  ModelImagePlacementMode,
  type ImagePlacementMode,
} from "./model-image-placement-mode";
import {
  FoundryDropZone,
  extensionOf,
  stageDroppedFile,
} from "@/components/foundry/foundry-drop-zone";
import {
  decodeModelImageFrames,
  encodeModelImageFrames,
} from "@/lib/model-image-layer-data";
import type {
  ModelImageProjector,
  ModelImageProjectionFrame,
} from "@/lib/model-image-projection";
import type { ModdingModelImage } from "@/types/generated/ModdingModelImage";
import type { ModdingModelImagePixels } from "@/types/generated/ModdingModelImagePixels";

import { getFileBaseName } from "@/lib/file-utils";
import type { ModelImageSurfaceDraft } from "@/lib/model-image-surface-preview";

const EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "tga", "gif"];
interface ImageSource {
  name: string;
  addonId: string;
  material: string;
  path: string;
  layerId: string;
  frames: ModelImageProjectionFrame[] | null;
  stickerFrames: readonly ModelImageProjectionFrame[] | null;
  plays: number;
  frameCount: number;
}
interface Request {
  addonId: string;
  material: string;
  mode: ImagePlacementMode;
  alignment: ModelImageAlignment;
  operation:
    | { kind: "path"; path: string }
    | { kind: "file"; file: File }
    | { kind: "apply"; source: ImageSource }
    | { kind: "preview"; source: ImageSource }
    | { kind: "repeat"; source: ImageSource };
}
interface Props {
  imageDraft: RefObject<ModelImageSurfaceDraft | null>;
  placementTarget: HTMLDivElement | null;
  onPlacementActiveChange: (active: boolean) => void;
  addonId: string;
  material: string;
  disabled: boolean;
  onImage: (imagePath: string, layerId: string) => void;
  projector: RefObject<ModelImageProjector | null>;
  dropHandler: RefObject<
    ((file: File, point: { x: number; y: number }) => void) | null
  >;
}

export function ModelImageLayers({
  addonId,
  material,
  disabled,
  onImage,
  projector,
  dropHandler,
  placementTarget,
  onPlacementActiveChange,
  imageDraft,
}: Props) {
  const { t } = useTranslation();
  const owner = useRef({ active: false });
  useEffect(() => {
    const generation = { active: true };
    owner.current = generation;
    return () => {
      generation.active = false;
    };
  }, [addonId, material]);
  const [mode, setMode] = useState<ImagePlacementMode>("projection");
  const [alignment, setAlignment] = useState(defaultImageAlignment);
  const [draftOpen, setDraftOpen] = useState(false);
  const [source, setSource] = useState<ImageSource | null>(null);
  const currentSource =
    source?.addonId === addonId && source.material === material ? source : null;
  const placementActive =
    mode === "projection" && draftOpen && Boolean(currentSource?.stickerFrames);
  useEffect(() => {
    imageDraft.current =
      placementActive && currentSource?.stickerFrames
        ? {
            material,
            frames: currentSource.stickerFrames,
            plays: currentSource.plays,
            alignment,
          }
        : null;
    return () => {
      imageDraft.current = null;
    };
  }, [imageDraft, placementActive, currentSource, alignment, material]);
  const importImage = useMutation({
    mutationKey: ["workbench-model-image-layer", addonId, material],
    mutationFn: async (request: Request) => {
      const generation = owner.current;
      const remember = (next: ImageSource) => {
        if (generation.active && owner.current === generation) setSource(next);
      };
      let original: ImageSource;
      if (
        request.operation.kind === "apply" ||
        request.operation.kind === "preview" ||
        request.operation.kind === "repeat"
      )
        original = request.operation.source;
      else {
        const path =
          request.operation.kind === "file"
            ? await stageDroppedFile(request.operation.file)
            : request.operation.path;
        const imported = await invoke<ModdingModelImage>(
          "import_modding_model_image",
          { addonId: request.addonId, path },
        );
        original = {
          name: path.split(/[\\/]/).at(-1) ?? path,
          addonId: request.addonId,
          material: request.material,
          path: imported.path,
          layerId: crypto.randomUUID(),
          frames: null,
          stickerFrames: null,
          plays: imported.plays,
          frameCount: imported.frames.length,
        };
      }
      remember(original);
      if (request.mode === "uv" && request.operation.kind !== "repeat")
        return { source: original, path: original.path, generation };

      if (!original.frames) {
        const pixels = await invoke<ModdingModelImagePixels>(
          "read_modding_model_image",
          { addonId: request.addonId, path: original.path },
        );
        const frames = decodeModelImageFrames(pixels.frames);
        original = {
          ...original,
          frames,
          stickerFrames: trimModelImageFrames(frames),
          plays: pixels.plays,
          frameCount: pixels.frames.length,
        };
      }
      if (!generation.active || owner.current !== generation)
        return { source: original, path: original.path, generation };
      if (request.operation.kind === "repeat") {
        const repeated = await invoke<ModdingModelImage>(
          "save_modding_projected_image",
          {
            addonId: request.addonId,
            frames: encodeModelImageFrames(original.frames ?? []),
            plays: 0,
          },
        );
        original = { ...original, path: repeated.path, plays: 0 };
        remember(original);
        if (request.mode === "uv")
          return { source: original, path: original.path, generation };
      }
      remember(original);
      if (request.operation.kind !== "apply")
        return { source: original, path: null, generation };
      const project = projector.current;
      if (!project)
        throw new ValidationError(t("modelEditor.paint.projectionNotReady"));
      const frames = project({
        material: request.material,
        frames: original.stickerFrames ?? [],
        ...request.alignment,
      });
      if (
        !frames.some((frame) =>
          frame.rgba.some((value, index) => index % 4 === 3 && value > 0),
        )
      )
        throw new ValidationError(t("modelEditor.paint.projectionEmpty"));
      const saved = await invoke<ModdingModelImage>(
        "save_modding_projected_image",
        {
          addonId: request.addonId,
          frames: encodeModelImageFrames(frames),
          plays: original.plays,
        },
      );
      return { source: original, path: saved.path, generation };
    },
    onSuccess: (result, request) => {
      if (
        !result.generation.active ||
        result.generation !== owner.current ||
        request.addonId !== addonId ||
        request.material !== material
      )
        return;
      setSource(result.source);
      setDraftOpen(request.mode === "projection" && result.path === null);
      if (result.path) onImage(result.path, result.source.layerId);
    },
  });
  const placementBusy =
    placementActive || (mode === "projection" && importImage.isPending);
  useEffect(() => {
    onPlacementActiveChange(placementBusy);
    return () => onPlacementActiveChange(false);
  }, [placementBusy, onPlacementActiveChange]);
  const busy = disabled || importImage.isPending;
  const drop = useEffectEvent((file: File, point: { x: number; y: number }) => {
    if (busy || !EXTENSIONS.includes(extensionOf(getFileBaseName(file))))
      return;
    const next: ModelImageAlignment = {
      ...alignment,
      crop: { ...fullImageCrop },
      center: [
        Math.max(0, Math.min(1, point.x)),
        Math.max(0, Math.min(1, point.y)),
      ],
    };
    setMode("projection");
    setAlignment(next);
    importImage.mutate({
      addonId,
      material,
      mode: "projection",
      alignment: next,
      operation: { kind: "file", file },
    });
  });
  useEffect(() => {
    const handler = (file: File, point: { x: number; y: number }) =>
      drop(file, point);
    dropHandler.current = handler;
    return () => {
      if (dropHandler.current === handler) dropHandler.current = null;
    };
  }, [dropHandler]);
  const change = (field: "x" | "y" | "scale" | "rotation", value: number) => {
    if (!Number.isFinite(value)) return;
    setAlignment((previous) => ({
      crop: previous.crop,
      center:
        field === "x"
          ? [Math.max(0, Math.min(1, value / 100)), previous.center[1]]
          : field === "y"
            ? [previous.center[0], Math.max(0, Math.min(1, value / 100))]
            : previous.center,
      scale:
        field === "scale"
          ? Math.max(0.05, Math.min(2, value / 100))
          : previous.scale,
      rotation:
        field === "rotation" ? (value * Math.PI) / 180 : previous.rotation,
    }));
    if (currentSource?.frames) setDraftOpen(true);
  };
  const apply = () => {
    if (!currentSource) return;
    importImage.mutate({
      addonId,
      material,
      mode,
      alignment,
      operation: {
        kind: mode === "projection" && !draftOpen ? "preview" : "apply",
        source: currentSource,
      },
    });
  };
  return (
    <div className='space-y-2'>
      {placementTarget &&
      mode === "projection" &&
      (importImage.isPending || importImage.error)
        ? createPortal(
            <p
              role={importImage.error ? "alert" : "status"}
              className='pointer-events-none absolute top-3 left-3 z-30 max-w-[calc(100%-6rem)] rounded border bg-popover px-3 py-2 text-xs'>
              {importImage.error?.message ??
                t("modelEditor.paint.importingImage")}
            </p>,
            placementTarget,
          )
        : null}
      {placementTarget &&
      mode === "projection" &&
      draftOpen &&
      currentSource?.stickerFrames
        ? createPortal(
            <ModelImagePlacement
              frames={currentSource.stickerFrames}
              plays={currentSource.plays}
              alignment={alignment}
              disabled={busy}
              onChange={setAlignment}
              onApply={apply}
              onCancel={() => {
                setDraftOpen(false);
                importImage.reset();
              }}
            />,
            placementTarget,
          )
        : null}
      <ModelImagePlacementMode
        value={mode}
        disabled={busy}
        onChange={(next) => {
          setMode(next);
          if (next === "projection" && currentSource)
            importImage.mutate({
              addonId,
              material,
              mode: next,
              alignment,
              operation: { kind: "preview", source: currentSource },
            });
        }}
      />
      <FoundryDropZone
        title={t(
          currentSource
            ? "modelEditor.paint.replaceImage"
            : "modelEditor.paint.importImage",
        )}
        className={currentSource ? "py-2" : undefined}
        dialogTitle={t("modelEditor.paint.importImage")}
        extensions={EXTENSIONS}
        disabled={busy}
        onFile={(path) => {
          const next = { ...alignment, crop: { ...fullImageCrop } };
          setAlignment(next);
          importImage.mutate({
            addonId,
            material,
            mode,
            alignment: next,
            operation: { kind: "path", path },
          });
        }}
      />
      {currentSource ? (
        <p className='truncate text-xs' title={currentSource.name}>
          {currentSource.name}
          <span className='ml-2 text-muted-foreground'>
            {t("modelEditor.paint.imageFrames", {
              count: currentSource.frameCount,
            })}
          </span>
        </p>
      ) : null}
      {mode === "projection" && currentSource ? (
        <details className='border-y py-2'>
          <summary className='cursor-pointer text-xs font-medium'>
            {t("modelEditor.paint.precisePlacement")}
          </summary>
          <fieldset disabled={busy} className='mt-2 grid grid-cols-2 gap-2'>
            <label className='space-y-1'>
              {t("modelEditor.paint.projectionX")}
              <Input
                className='h-7 text-xs'
                type='number'
                min={0}
                max={100}
                step={1}
                value={Math.round(alignment.center[0] * 100)}
                onChange={(event) => change("x", event.target.valueAsNumber)}
              />
            </label>
            <label className='space-y-1'>
              {t("modelEditor.paint.projectionY")}
              <Input
                className='h-7 text-xs'
                type='number'
                min={0}
                max={100}
                step={1}
                value={Math.round(alignment.center[1] * 100)}
                onChange={(event) => change("y", event.target.valueAsNumber)}
              />
            </label>
            <label className='space-y-1'>
              {t("modelEditor.paint.projectionScale")}
              <Input
                className='h-7 text-xs'
                type='number'
                min={5}
                max={200}
                step={1}
                value={Math.round(alignment.scale * 100)}
                onChange={(event) =>
                  change("scale", event.target.valueAsNumber)
                }
              />
            </label>
            <label className='space-y-1'>
              {t("modelEditor.paint.projectionRotation")}
              <Input
                className='h-7 text-xs'
                type='number'
                min={-180}
                max={180}
                step={1}
                value={Math.round((alignment.rotation * 180) / Math.PI)}
                onChange={(event) =>
                  change("rotation", event.target.valueAsNumber)
                }
              />
            </label>
          </fieldset>
          <Button
            size='sm'
            variant='ghost'
            disabled={busy}
            className='mt-1 h-7 text-xs'
            onClick={() => {
              setAlignment((previous) => ({
                ...previous,
                crop: { ...fullImageCrop },
              }));
              setDraftOpen(true);
            }}>
            {t("modelEditor.paint.resetCrop")}
          </Button>
        </details>
      ) : null}
      {currentSource && !placementActive ? (
        <Button
          size='sm'
          variant='secondary'
          className='h-7 w-full text-xs'
          disabled={busy}
          onClick={apply}>
          {t(
            mode === "projection"
              ? draftOpen
                ? "modelEditor.paint.applyProjection"
                : "modelEditor.paint.repositionImage"
              : "modelEditor.paint.applyUvImage",
          )}
        </Button>
      ) : null}
      {currentSource &&
      currentSource.frameCount > 1 &&
      currentSource.plays > 0 ? (
        <div className='space-y-2 rounded border p-2'>
          <p className='text-[11px] text-muted-foreground'>
            {t("modelEditor.paint.finiteImageHint")}
          </p>
          <Button
            size='sm'
            variant='secondary'
            className='h-7 w-full text-xs'
            disabled={busy}
            onClick={() =>
              importImage.mutate({
                addonId,
                material,
                mode,
                alignment,
                operation: { kind: "repeat", source: currentSource },
              })
            }>
            {t("modelEditor.paint.repeatImageForever")}
          </Button>
        </div>
      ) : null}
      {importImage.isPending ? (
        <p role='status'>{t("modelEditor.paint.importingImage")}</p>
      ) : null}
      {importImage.error ? (
        <p role='alert' className='text-destructive'>
          {importImage.error.message}
        </p>
      ) : null}
    </div>
  );
}
