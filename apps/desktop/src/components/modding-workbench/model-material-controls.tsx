import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { ModdingModelPart } from "@/types/generated/ModdingModelPart";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import { resetModelPart } from "@/lib/model-edit-history";

export function ModelMaterialControls({
  part,
  edit,
  disabled,
  onChange,
  onReset,
  resetLabel,
}: {
  part: ModdingModelPart;
  edit: ModdingModelPartEdit;
  disabled: boolean;
  onChange: (edit: ModdingModelPartEdit) => void;
  onReset?: () => void;
  resetLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <fieldset disabled={disabled} className='min-w-0 space-y-4 p-3 text-xs'>
      <div className='flex min-w-0 items-center gap-2'>
        <h4
          className='min-w-0 flex-1 truncate text-sm font-medium'
          title={part.material}>
          {part.material
            .split("/")
            .at(-1)
            ?.replace(/\.vmat$/, "")}
        </h4>
        <Button
          size='icon'
          variant='ghost'
          className='size-7 shrink-0'
          aria-label={resetLabel ?? t("modelEditor.resetPart")}
          title={resetLabel ?? t("modelEditor.resetPart")}
          onClick={() =>
            onReset ? onReset() : onChange(resetModelPart(edit.material))
          }>
          <ArrowCounterClockwiseIcon />
        </Button>
      </div>
      {part.diagnostic ? (
        <p className='text-muted-foreground'>
          {part.diagnostic === "shader"
            ? t("modelEditor.unsupportedShader")
            : part.diagnostic === "dynamicFinish"
              ? t("modelEditor.dynamicFinish")
              : part.diagnostic === "missingChannels"
                ? t("modelEditor.missingChannels")
                : t("modelEditor.unsupportedTexture")}
        </p>
      ) : null}
      <div className='space-y-3'>
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            disabled={!part.tintable}
            checked={edit.tint !== null}
            onChange={(event) =>
              onChange({
                ...edit,
                tint: event.target.checked ? "#ffffff" : null,
              })
            }
          />
          {t("modelEditor.tint")}
        </label>
        {edit.tint ? (
          <input
            type='color'
            disabled={!part.tintable}
            aria-label={t("modelEditor.tintColor")}
            value={edit.tint}
            className='h-8 w-full cursor-pointer rounded border bg-background'
            onChange={(event) =>
              onChange({ ...edit, tint: event.target.value })
            }
          />
        ) : null}
      </div>
      <div className='space-y-3'>
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            disabled={!part.tintable}
            checked={edit.recolor !== null}
            onChange={(event) =>
              onChange({
                ...edit,
                recolor: event.target.checked
                  ? { color: "#e1ac47", saturation: 1, brightness: 1 }
                  : null,
              })
            }
          />
          {t("modelEditor.recolor")}
        </label>
        {edit.recolor ? (
          <>
            <input
              type='color'
              disabled={!part.tintable}
              aria-label={t("modelEditor.recolorColor")}
              value={edit.recolor.color}
              className='h-8 w-full cursor-pointer rounded border bg-background'
              onChange={(event) =>
                onChange({
                  ...edit,
                  recolor: {
                    ...edit.recolor,
                    color: event.target.value,
                    saturation: edit.recolor?.saturation ?? 1,
                    brightness: edit.recolor?.brightness ?? 1,
                  },
                })
              }
            />
            <div className='flex justify-between'>
              <span>{t("modelEditor.saturation")}</span>
              <output>{edit.recolor.saturation.toFixed(2)}</output>
            </div>
            <Slider
              disabled={!part.tintable}
              aria-label={t("modelEditor.saturation")}
              min={0}
              max={2}
              step={0.01}
              value={[edit.recolor.saturation]}
              onValueChange={([value]) => {
                if (edit.recolor)
                  onChange({
                    ...edit,
                    recolor: { ...edit.recolor, saturation: value },
                  });
              }}
            />
            <div className='flex justify-between'>
              <span>{t("modelEditor.brightness")}</span>
              <output>{edit.recolor.brightness.toFixed(2)}</output>
            </div>
            <Slider
              disabled={!part.tintable}
              aria-label={t("modelEditor.brightness")}
              min={0}
              max={2}
              step={0.01}
              value={[edit.recolor.brightness]}
              onValueChange={([value]) => {
                if (edit.recolor)
                  onChange({
                    ...edit,
                    recolor: { ...edit.recolor, brightness: value },
                  });
              }}
            />
          </>
        ) : null}
      </div>
      <div className='space-y-3'>
        <label className='flex items-center justify-between gap-2'>
          <span className='flex items-center gap-2'>
            <input
              type='checkbox'
              disabled={!part.roughnessEditable}
              checked={edit.roughness !== null}
              onChange={(event) =>
                onChange({
                  ...edit,
                  roughness: event.target.checked ? 0.5 : null,
                })
              }
            />
            {t("modelEditor.roughness")}
          </span>
          <output className='text-[11px] text-muted-foreground'>
            {edit.roughness === null ? (
              t("modelEditor.authored")
            ) : (
              <Input
                type='number'
                disabled={!part.roughnessEditable}
                aria-label={t("modelEditor.roughnessValue")}
                min={0}
                max={1}
                step={0.01}
                value={edit.roughness}
                className='h-7 w-20 px-2 font-mono text-xs'
                onChange={(e) => {
                  const value = e.target.valueAsNumber;
                  if (Number.isFinite(value) && value >= 0 && value <= 1)
                    onChange({ ...edit, roughness: value });
                }}
              />
            )}
          </output>
        </label>
        {edit.roughness !== null ? (
          <Slider
            disabled={!part.roughnessEditable}
            aria-label={t("modelEditor.roughness")}
            min={0}
            max={1}
            step={0.01}
            value={[edit.roughness]}
            onValueChange={([value]) => onChange({ ...edit, roughness: value })}
          />
        ) : null}
      </div>
      <div className='space-y-3'>
        <label className='flex items-center justify-between gap-2'>
          <span className='flex items-center gap-2'>
            <input
              type='checkbox'
              disabled={!part.metalnessEditable}
              checked={edit.metalness !== null}
              onChange={(event) =>
                onChange({
                  ...edit,
                  metalness: event.target.checked ? 0 : null,
                })
              }
            />
            {t("modelEditor.metalness")}
          </span>
          <output className='text-[11px] text-muted-foreground'>
            {edit.metalness === null ? (
              t("modelEditor.authored")
            ) : (
              <Input
                type='number'
                disabled={!part.metalnessEditable}
                aria-label={t("modelEditor.metalnessValue")}
                min={0}
                max={1}
                step={0.01}
                value={edit.metalness}
                className='h-7 w-20 px-2 font-mono text-xs'
                onChange={(e) => {
                  const value = e.target.valueAsNumber;
                  if (Number.isFinite(value) && value >= 0 && value <= 1)
                    onChange({ ...edit, metalness: value });
                }}
              />
            )}
          </output>
        </label>
        {edit.metalness !== null ? (
          <Slider
            disabled={!part.metalnessEditable}
            aria-label={t("modelEditor.metalness")}
            min={0}
            max={1}
            step={0.01}
            value={[edit.metalness]}
            onValueChange={([value]) => onChange({ ...edit, metalness: value })}
          />
        ) : null}
      </div>
      <details className='text-[11px] text-muted-foreground'>
        <summary className='cursor-pointer'>
          {t("modelEditor.sourcePath")}
        </summary>
        <p className='mt-2 break-all font-mono'>{part.material}</p>
      </details>
    </fieldset>
  );
}
