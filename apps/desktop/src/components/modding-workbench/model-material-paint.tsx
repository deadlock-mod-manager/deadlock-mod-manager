import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type RefObject } from "react";
import type { ModelSurfacePaintTool } from "@/lib/model-surface-paint";
import type { ModdingPaintStroke } from "@/types/generated/ModdingPaintStroke";
import { useTranslation } from "react-i18next";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import type { ModdingPaintLayer } from "@/types/generated/ModdingPaintLayer";
import type { ModdingPaintBlend } from "@/types/generated/ModdingPaintBlend";
import { ModelImageLayers } from "./model-image-layers";
import type { ModelImageProjector } from "@/lib/model-image-projection";
import type { ModelImageSurfaceDraft } from "@/lib/model-image-surface-preview";
import { ModelPaintCanvas } from "./model-paint-canvas";
import { modelPaintQuery } from "./use-model-paint";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const MODES: ModdingPaintBlend[] = ["normal", "multiply", "screen", "overlay"];
const layer = (name: string): ModdingPaintLayer => ({
  id: crypto.randomUUID(),
  name,
  visible: true,
  opacity: 1,
  blend: "normal",
  strokes: [],
});

export function ModelMaterialPaint({
  addonId,
  edit,
  disabled,
  onChange,
  imageProjector,
  imageDrop,
  imageDraft,
  imagePlacementTarget,
  onPlacementActiveChange,
  surfaceTool,
  surfaceEnabled,
  onSurfaceEnabledChange,
}: {
  addonId: string;
  edit: ModdingModelPartEdit;
  disabled: boolean;
  onChange: (edit: ModdingModelPartEdit) => void;
  imageProjector: RefObject<ModelImageProjector | null>;
  imageDraft: RefObject<ModelImageSurfaceDraft | null>;
  imageDrop: RefObject<
    ((file: File, point: { x: number; y: number }) => void) | null
  >;
  imagePlacementTarget: HTMLDivElement | null;
  onPlacementActiveChange: (active: boolean) => void;
  surfaceTool: RefObject<ModelSurfacePaintTool | null>;
  surfaceEnabled: boolean;
  onSurfaceEnabledChange: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selected, select] = useState(0);
  const [color, setColor] = useState("#e87523");
  const [radius, setRadius] = useState(0.04);
  const [hardness, setHardness] = useState(0.8);
  const [opacity, setOpacity] = useState(1);
  const [erase, setErase] = useState(false);
  const [fill, setFill] = useState(false);
  const [tolerance, setTolerance] = useState(0.08);
  useEffect(
    () => () => {
      surfaceTool.current = null;
      onSurfaceEnabledChange(false);
    },
    [surfaceTool, onSurfaceEnabledChange],
  );
  const paint = useMemo(
    () =>
      edit.paint ?? {
        layers: [layer(t("modelEditor.paint.layerName", { count: 1 }))],
      },
    [edit.paint, t],
  );
  const debounced = useDebouncedValue(paint, 150);
  const remaining =
    4096 -
    paint.layers
      .flatMap((l) => l.strokes)
      .reduce((count, s) => count + s.points.length, 0);
  const strokeCount = paint.layers.reduce(
    (count, l) => count + l.strokes.length,
    0,
  );
  const index = Math.min(selected, paint.layers.length - 1);
  const active = paint.layers[index];
  const preview = useQuery({
    ...modelPaintQuery(addonId, edit.material, debounced),
    enabled: open,
  });
  const replace = (updated: ModdingPaintLayer) =>
    onChange({
      ...edit,
      paint: {
        layers: paint.layers.map((l, i) => (i === index ? updated : l)),
      },
    });
  const brush: Omit<ModdingPaintStroke, "points"> = {
    color: [
      Number.parseInt(color.slice(1, 3), 16),
      Number.parseInt(color.slice(3, 5), 16),
      Number.parseInt(color.slice(5, 7), 16),
    ],
    radius,
    hardness,
    opacity,
    erase,
  };
  if (fill) brush.fillTolerance = tolerance;
  const blocked =
    disabled || !active?.visible || remaining <= 0 || strokeCount >= 128;
  surfaceTool.current =
    open && surfaceEnabled && !blocked
      ? {
          material: edit.material,
          brush,
          maxPoints: Math.min(512, remaining),
          onStroke: (stroke) => {
            if (active)
              replace({ ...active, strokes: [...active.strokes, stroke] });
          },
          onStrokes: (strokes) => {
            if (active && strokeCount + strokes.length <= 128)
              replace({ ...active, strokes: [...active.strokes, ...strokes] });
          },
        }
      : null;
  return (
    <details
      className='border-t p-3 text-xs'
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
        if (!e.currentTarget.open) onSurfaceEnabledChange(false);
      }}>
      <summary className='cursor-pointer font-medium leading-5'>
        {t("modelEditor.paint.title")}
      </summary>
      {open ? (
        <fieldset disabled={disabled} className='mt-3 min-w-0 space-y-3'>
          <ModelImageLayers
            imageDraft={imageDraft}
            onPlacementActiveChange={onPlacementActiveChange}
            placementTarget={imagePlacementTarget}
            addonId={addonId}
            material={edit.material}
            projector={imageProjector}
            dropHandler={imageDrop}
            disabled={disabled || paint.layers.length >= 8}
            onImage={(image, id) => {
              const existing = paint.layers.find((item) => item.id === id);
              const next = {
                ...(existing ?? layer(t("modelEditor.paint.imageLayer"))),
                id,
                image,
              };
              onChange({
                ...edit,
                paint: {
                  layers: existing
                    ? paint.layers.map((item) => (item.id === id ? next : item))
                    : [...paint.layers, next],
                },
              });
              select(
                existing
                  ? paint.layers.findIndex((item) => item.id === id)
                  : paint.layers.length,
              );
            }}
          />
          <div className='border-t pt-3 text-xs font-medium'>
            {t("modelEditor.paint.brushTools")}
          </div>
          <p className='text-[11px] leading-relaxed text-muted-foreground'>
            {t("modelEditor.paint.hint")}
          </p>
          <div className='flex flex-wrap items-center gap-2'>
            <label className='flex flex-1 items-center justify-between gap-2'>
              {t("modelEditor.paint.tool")}
              <select
                className='h-8 rounded border bg-background px-2'
                value={fill ? "fill" : "brush"}
                onChange={(e) => setFill(e.target.value === "fill")}>
                <option value='brush'>{t("modelEditor.paint.brush")}</option>
                <option value='fill'>{t("modelEditor.paint.fill")}</option>
              </select>
            </label>
            <Button
              size='sm'
              variant={surfaceEnabled ? "default" : "outline"}
              aria-pressed={surfaceEnabled}
              onClick={() => onSurfaceEnabledChange(!surfaceEnabled)}
              disabled={blocked}>
              {t("modelEditor.paint.surface")}
            </Button>
          </div>
          {surfaceEnabled ? (
            <p className='text-[11px] text-muted-foreground'>
              {t("modelEditor.paint.surfaceHint")}
            </p>
          ) : null}
          {fill ? (
            <label className='block space-y-2'>
              {t("modelEditor.paint.tolerance")}{" "}
              <output>{Math.round(tolerance * 100)}%</output>
              <input
                className='w-full'
                aria-label={t("modelEditor.paint.tolerance")}
                type='range'
                min={0}
                max={1}
                step={0.01}
                value={tolerance}
                onChange={(e) => setTolerance(e.target.valueAsNumber)}
              />
            </label>
          ) : null}
          <ModelPaintCanvas
            pixels={preview.data?.frames[0]?.pixels}
            disabled={
              disabled ||
              preview.isFetching ||
              !active?.visible ||
              remaining <= 0 ||
              strokeCount >= 128
            }
            maxPoints={Math.min(512, remaining)}
            brush={brush}
            onStroke={(stroke) => {
              if (active)
                replace({ ...active, strokes: [...active.strokes, stroke] });
            }}
          />
          {(preview.data?.frames.length ?? 0) > 1 ? (
            <p className='text-[11px] text-muted-foreground'>
              {t("modelEditor.paint.exportResolution", {
                width: preview.data?.frameWidth,
                height: preview.data?.frameHeight,
              })}
            </p>
          ) : null}
          {preview.isFetching ? (
            <p role='status'>{t("modelEditor.paint.updating")}</p>
          ) : null}
          {preview.error ? (
            <p role='alert' className='text-destructive'>
              {preview.error.message}
            </p>
          ) : null}
          <label className='flex items-center justify-between gap-2'>
            {t("modelEditor.paint.color")}
            <input
              type='color'
              aria-label={t("modelEditor.paint.color")}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className='h-7 w-16 rounded border bg-background'
            />
          </label>
          {[
            {
              name: "radius",
              value: radius,
              set: setRadius,
              min: 0.002,
              max: 0.25,
            },
            {
              name: "hardness",
              value: hardness,
              set: setHardness,
              min: 0,
              max: 1,
            },
            {
              name: "opacity",
              value: opacity,
              set: setOpacity,
              min: 0,
              max: 1,
            },
          ].map((control) => (
            <label
              className='grid grid-cols-[1fr_auto] items-center gap-2'
              key={control.name}>
              {t(`modelEditor.paint.${control.name}`)}
              <output>{Math.round(control.value * 100)}%</output>
              <input
                className='col-span-2 w-full'
                aria-label={t(`modelEditor.paint.${control.name}`)}
                type='range'
                min={control.min}
                max={control.max}
                step={0.002}
                value={control.value}
                onChange={(e) => control.set(e.target.valueAsNumber)}
              />
            </label>
          ))}
          <label className='flex items-center gap-2'>
            <input
              type='checkbox'
              checked={erase}
              onChange={(e) => setErase(e.target.checked)}
            />
            {t("modelEditor.paint.erase")}
          </label>
          <p className='border-t pt-3 font-medium'>
            {t("modelEditor.paint.layers")}
          </p>
          <div className='space-y-1'>
            {paint.layers.map((l, i) => (
              <div
                key={l.id}
                className={`flex items-center gap-2 rounded px-2 ${i === index ? "bg-muted" : ""}`}>
                <input
                  type='checkbox'
                  aria-label={t("modelEditor.paint.visible", { name: l.name })}
                  checked={l.visible}
                  onChange={(e) =>
                    onChange({
                      ...edit,
                      paint: {
                        layers: paint.layers.map((l, n) =>
                          n === i ? { ...l, visible: e.target.checked } : l,
                        ),
                      },
                    })
                  }
                />
                <button
                  className='min-w-0 flex-1 truncate py-2 text-left'
                  type='button'
                  aria-pressed={i === index}
                  onClick={() => select(i)}>
                  {l.name}
                </button>
              </div>
            ))}
          </div>
          {active ? (
            <>
              <Input
                aria-label={t("modelEditor.paint.name")}
                className='h-8 text-xs'
                maxLength={80}
                value={active.name}
                onChange={(e) => replace({ ...active, name: e.target.value })}
              />
              <label className='flex items-center justify-between gap-2'>
                {t("modelEditor.paint.blend")}
                <select
                  className='h-8 min-w-0 rounded border bg-background px-2'
                  aria-label={t("modelEditor.paint.blend")}
                  value={active.blend}
                  onChange={(e) => {
                    const blend = MODES.find((m) => m === e.target.value);
                    if (blend) replace({ ...active, blend });
                  }}>
                  {MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`modelEditor.paint.modes.${mode}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className='block space-y-2'>
                {t("modelEditor.paint.layerOpacity")}
                <input
                  className='block w-full'
                  aria-label={t("modelEditor.paint.layerOpacity")}
                  type='range'
                  min={0}
                  max={1}
                  step={0.01}
                  value={active.opacity}
                  onChange={(e) =>
                    replace({ ...active, opacity: e.target.valueAsNumber })
                  }
                />
              </label>
            </>
          ) : null}
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={paint.layers.length >= 8}
              onClick={() => {
                select(paint.layers.length);
                onChange({
                  ...edit,
                  paint: {
                    layers: [
                      ...paint.layers,
                      layer(
                        t("modelEditor.paint.layerName", {
                          count: paint.layers.length + 1,
                        }),
                      ),
                    ],
                  },
                });
              }}>
              {t("modelEditor.paint.add")}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              disabled={paint.layers.length <= 1}
              onClick={() =>
                onChange({
                  ...edit,
                  paint: { layers: paint.layers.filter((_, i) => i !== index) },
                })
              }>
              {t("modelEditor.paint.remove")}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              disabled={!edit.paint}
              onClick={() => onChange({ ...edit, paint: null })}>
              {t("modelEditor.paint.clear")}
            </Button>
          </div>
          <p className='text-[11px] text-muted-foreground'>
            {t("modelEditor.paint.baseLocked")}
          </p>
        </fieldset>
      ) : null}
    </details>
  );
}
