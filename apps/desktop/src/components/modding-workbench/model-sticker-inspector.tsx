import { Button } from "@deadlock-mods/ui/components/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@deadlock-mods/ui/components/accordion";
import {
  ArrowsOutCardinalIcon,
  ArrowsClockwiseIcon,
  CornersOutIcon,
  TrashIcon,
  CaretDownIcon,
} from "@phosphor-icons/react";
import { ModelEditorNumber } from "./model-editor-number";
import { ModelStickerFinish } from "./model-sticker-finish";
import { useTranslation } from "react-i18next";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import type { ModelPatchImage } from "@/lib/model-patch-runtime";
import { modelPatchTrim } from "@/lib/model-patch-geometry";

type Mode = "translate" | "rotate" | "scale";

export function ModelStickerInspector({
  selected,
  activeMode,
  busy,
  image,
  onChange: change,
  onModeChange,
  onReposition,
  onDone,
  onRemove,
  onFit,
}: {
  selected: ModdingModelPatch;
  activeMode: Mode;
  busy: boolean;
  image: ModelPatchImage | undefined;
  onChange: (patch: ModdingModelPatch) => void;
  onModeChange: (mode: Mode) => void;
  onReposition: () => void;
  onDone: () => void;
  onRemove: () => void;
  onFit: () => void;
}) {
  const { t } = useTranslation();
  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ) => (
    <ModelEditorNumber
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={busy}
      onChange={onChange}
    />
  );
  return (
    <div className='space-y-4 border-t pt-4'>
      <div
        className='flex rounded-md bg-muted/60 p-1'
        role='group'
        aria-label={t("modelEditor.stickers.transform")}>
        {(
          ["translate", "rotate", "scale"] satisfies (
            | "translate"
            | "rotate"
            | "scale"
          )[]
        ).map((mode) => (
          <Button
            key={mode}
            size='sm'
            variant={activeMode === mode ? "secondary" : "ghost"}
            className='h-8 min-w-0 flex-1 gap-1.5 px-1 text-xs'
            aria-pressed={activeMode === mode}
            disabled={busy}
            onClick={() => onModeChange(mode)}>
            {mode === "translate" ? (
              <ArrowsOutCardinalIcon className='size-3.5' />
            ) : mode === "rotate" ? (
              <ArrowsClockwiseIcon className='size-3.5' />
            ) : (
              <CornersOutIcon className='size-3.5' />
            )}
            {t(`modelEditor.stickers.${mode}`)}
          </Button>
        ))}
      </div>
      <div className='flex gap-2'>
        <Button
          size='sm'
          variant='outline'
          className='flex-1'
          disabled={busy}
          onClick={onReposition}>
          {t("modelEditor.stickers.reposition")}
        </Button>
        <Button size='sm' variant='ghost' onClick={onDone}>
          {t("modelEditor.stickers.done")}
        </Button>
      </div>
      <Accordion
        type='multiple'
        defaultValue={["surface"]}
        className='border-t'>
        <AccordionItem value='surface'>
          <AccordionTrigger className='py-3 text-xs hover:no-underline'>
            {t("modelEditor.inspector.stickerSurface")}
          </AccordionTrigger>
          <AccordionContent className='space-y-3 pb-4'>
            <label className='flex items-center justify-between gap-3 text-xs'>
              <span>{t("modelEditor.stickers.shape")}</span>
              <div className='relative min-w-0 max-w-40'>
                <select
                  className='h-8 w-full appearance-none rounded-md border border-input bg-background pl-2 pr-7 text-xs text-foreground'
                  value={selected.shape}
                  disabled={busy}
                  onChange={(event) => {
                    const shape = event.target.value;
                    if (
                      shape === "conform" ||
                      shape === "flat" ||
                      shape === "curve" ||
                      shape === "dome"
                    )
                      change({ ...selected, shape });
                  }}>
                  <option value='conform'>
                    {t("modelEditor.stickers.conform")}
                  </option>
                  <option value='flat'>{t("modelEditor.stickers.flat")}</option>
                  <option value='curve'>
                    {t("modelEditor.stickers.curve")}
                  </option>
                  <option value='dome'>{t("modelEditor.stickers.dome")}</option>
                </select>
                <CaretDownIcon className='pointer-events-none absolute right-2 top-2.5 size-3 text-muted-foreground' />
              </div>
            </label>
            {number(
              "modelEditor.stickers.width",
              selected.size[0],
              0.01,
              1000,
              0.5,
              (value) =>
                change({ ...selected, size: [value, selected.size[1]] }),
            )}
            {number(
              "modelEditor.stickers.height",
              selected.size[1],
              0.01,
              1000,
              0.5,
              (value) =>
                change({ ...selected, size: [selected.size[0], value] }),
            )}
            {selected.shape === "conform" && (
              <>
                {number(
                  "modelEditor.stickers.conformity",
                  selected.conformity ?? 1,
                  0,
                  1,
                  0.05,
                  (conformity) => change({ ...selected, conformity }),
                )}
                <Button
                  size='sm'
                  variant='outline'
                  className='h-auto min-h-8 w-full whitespace-normal text-xs'
                  disabled={busy}
                  onClick={onFit}>
                  {t("modelEditor.stickers.fit")}
                </Button>
                <p className='text-[11px] leading-relaxed text-muted-foreground'>
                  {t("modelEditor.stickers.fitHint")}
                </p>
              </>
            )}
            {selected.shape !== "flat" &&
              number(
                "modelEditor.stickers.curvature",
                selected.curvature,
                0,
                1,
                0.05,
                (curvature) => change({ ...selected, curvature }),
              )}
            {number(
              "modelEditor.stickers.thickness",
              selected.thickness,
              0,
              10,
              0.05,
              (thickness) => change({ ...selected, thickness }),
            )}
            {number(
              "modelEditor.stickers.offset",
              selected.offset,
              -5,
              20,
              0.1,
              (offset) => change({ ...selected, offset }),
            )}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value='image'>
          <AccordionTrigger className='py-3 text-xs hover:no-underline'>
            {t("modelEditor.inspector.stickerImage")}
          </AccordionTrigger>
          <AccordionContent className='space-y-3 pb-4'>
            {number(
              "modelEditor.stickers.cropLeft",
              selected.crop[0] * 100,
              0,
              selected.crop[2] * 100 - 1,
              1,
              (value) =>
                change({
                  ...selected,
                  crop: [
                    value / 100,
                    selected.crop[1],
                    selected.crop[2],
                    selected.crop[3],
                  ],
                }),
            )}
            {number(
              "modelEditor.stickers.cropTop",
              selected.crop[1] * 100,
              0,
              selected.crop[3] * 100 - 1,
              1,
              (value) =>
                change({
                  ...selected,
                  crop: [
                    selected.crop[0],
                    value / 100,
                    selected.crop[2],
                    selected.crop[3],
                  ],
                }),
            )}
            {number(
              "modelEditor.stickers.cropRight",
              (1 - selected.crop[2]) * 100,
              0,
              (1 - selected.crop[0]) * 100 - 1,
              1,
              (value) =>
                change({
                  ...selected,
                  crop: [
                    selected.crop[0],
                    selected.crop[1],
                    1 - value / 100,
                    selected.crop[3],
                  ],
                }),
            )}
            {number(
              "modelEditor.stickers.cropBottom",
              (1 - selected.crop[3]) * 100,
              0,
              (1 - selected.crop[1]) * 100 - 1,
              1,
              (value) =>
                change({
                  ...selected,
                  crop: [
                    selected.crop[0],
                    selected.crop[1],
                    selected.crop[2],
                    1 - value / 100,
                  ],
                }),
            )}
            <Button
              size='sm'
              variant='outline'
              className='h-auto min-h-8 w-full whitespace-normal text-xs'
              disabled={busy || !image}
              onClick={() => {
                if (image)
                  change({
                    ...selected,
                    crop: modelPatchTrim(image.frames, selected.background),
                  });
              }}>
              {t("modelEditor.stickers.trim")}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              className='h-auto min-h-8 w-full whitespace-normal text-xs'
              disabled={busy}
              onClick={() => change({ ...selected, crop: [0, 0, 1, 1] })}>
              {t("modelEditor.stickers.resetCrop")}
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <ModelStickerFinish selected={selected} busy={busy} onChange={change} />

      <Button
        size='sm'
        variant='ghost'
        className='w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive'
        disabled={busy}
        onClick={onRemove}>
        <TrashIcon className='size-3.5' />
        {t("modelEditor.stickers.remove")}
      </Button>
    </div>
  );
}
