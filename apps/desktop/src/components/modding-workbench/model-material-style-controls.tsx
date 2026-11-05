import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import type { ModdingModelPart } from "@/types/generated/ModdingModelPart";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import { applyToonPreset } from "@/lib/model-material-presets";
import { ModelParameterControl } from "./model-parameter-control";

export function ModelMaterialStyleControls({
  part,
  edit,
  disabled,
  onChange,
  onPreset,
}: {
  part: ModdingModelPart;
  edit: ModdingModelPartEdit;
  disabled: boolean;
  onChange: (edit: ModdingModelPartEdit) => void;
  onPreset?: () => void;
}) {
  const { t } = useTranslation();
  const update = (name: string, values: number[] | null) =>
    onChange({
      ...edit,
      parameters: [
        ...edit.parameters.filter((p) => p.name !== name),
        ...(values ? [{ name, values }] : []),
      ],
    });
  return (
    <details className='border-t p-3 text-xs'>
      <summary className='cursor-pointer font-medium leading-5'>
        {t("modelEditor.materialProperties")}
      </summary>
      <fieldset disabled={disabled} className='mt-3 min-w-0'>
        <div className='space-y-2 pb-3'>
          <Button
            size='sm'
            variant='outline'
            className='h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-xs'
            disabled={!part.controls.length}
            onClick={() =>
              onPreset ? onPreset() : onChange(applyToonPreset(part, edit))
            }>
            {t("modelEditor.toonPreset")}
          </Button>
          <p className='text-[11px] leading-relaxed text-muted-foreground'>
            {t("modelEditor.toonHint")}
          </p>
        </div>
        {["color", "surface", "emission", "npr", "status", "motion"].map(
          (group) => (
            <details key={group} className='border-t py-3'>
              <summary className='cursor-pointer font-medium leading-5'>
                {t(`modelEditor.groups.${group}`)}
              </summary>
              <div className='mt-4 space-y-4'>
                {part.controls
                  .filter(
                    (c) =>
                      c.group === group &&
                      !(edit.pattern && c.name === "g_vAlbedoScrollSpeed1"),
                  )
                  .map((c) => (
                    <ModelParameterControl
                      key={c.name}
                      control={{
                        ...c,
                        expression:
                          edit.expressions.find((e) => e.name === c.name)
                            ?.source ?? c.expression,
                      }}
                      override={
                        edit.parameters.find((p) => p.name === c.name)?.values
                      }
                      onChange={(values) => update(c.name, values)}
                    />
                  ))}
              </div>
            </details>
          ),
        )}
      </fieldset>
    </details>
  );
}
