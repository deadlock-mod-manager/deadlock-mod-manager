import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import { applyReactivePreset } from "@/lib/model-material-presets";
import { compileMaterialExpression } from "@/components/foundry/model-material-expression";
import type { ModdingModelPart } from "@/types/generated/ModdingModelPart";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
export function ModelMaterialReactivity({
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
  onPreset?: (source: string) => void;
}) {
  const { t } = useTranslation();
  const set = (name: string, source: string | null) =>
    onChange({
      ...edit,
      parameters: edit.parameters.filter((p) => p.name !== name),
      expressions: [
        ...edit.expressions.filter((e) => e.name !== name),
        ...(source !== null ? [{ name, source }] : []),
      ],
    });
  const canPreset = ["F_SELF_ILLUM", "g_flSelfIllumScale1"].every((name) =>
    part.controls.some((control) => control.name === name),
  );
  const preset = (source: string) =>
    onPreset
      ? onPreset(source)
      : onChange(applyReactivePreset(part, edit, source));
  return (
    <details className='border-t p-3 text-xs'>
      <summary className='cursor-pointer font-medium leading-5'>
        {t("modelEditor.reactive.title")}
      </summary>
      <fieldset
        disabled={disabled || !part.controls.length}
        className='mt-3 min-w-0 space-y-3'>
        <p className='text-[11px] leading-relaxed text-muted-foreground'>
          {t("modelEditor.reactive.hint")}{" "}
          {t("modelEditor.reactive.customHint")}
        </p>
        <div className='grid gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={!canPreset}
            onClick={() => preset("5 + 5 * sin(3 * time())")}>
            {t("modelEditor.reactive.pulse")}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={!canPreset}
            onClick={() => preset("(1 - saturate($ent_health)) * 10")}>
            {t("modelEditor.reactive.health")}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={!canPreset}
            onClick={() => preset("saturate($ent_invuln) * 10")}>
            {t("modelEditor.reactive.invulnerable")}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={!canPreset}
            onClick={() => preset("saturate($ent_weakened) * 10")}>
            {t("modelEditor.reactive.weakened")}
          </Button>
        </div>
        <p className='break-all font-mono text-[10px] text-muted-foreground'>
          {t("modelEditor.reactive.attributes")}:{" "}
          {part.attributes.join(", ") || t("modelEditor.reactive.noAttributes")}
        </p>
        {["g_flSelfIllumScale1", "g_vColorTint1", "g_vAlbedoScrollSpeed1"]
          .filter(
            (name) =>
              part.controls.some((control) => control.name === name) &&
              !(edit.pattern && name === "g_vAlbedoScrollSpeed1"),
          )
          .map((name) => {
            const expression = edit.expressions.find((e) => e.name === name);
            return (
              <div key={name} className='space-y-2'>
                <label className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={!!expression}
                    onChange={(e) =>
                      set(
                        name,
                        e.target.checked
                          ? name === "g_vColorTint1"
                            ? "float3(1, 1, 1)"
                            : name === "g_vAlbedoScrollSpeed1"
                              ? "float2(0, 0)"
                              : "1"
                          : null,
                      )
                    }
                  />
                  {t(`modelEditor.parameters.${name}`)}
                </label>
                {expression ? (
                  <>
                    <textarea
                      spellCheck={false}
                      aria-label={t("modelEditor.reactive.expression", {
                        parameter: t(`modelEditor.parameters.${name}`),
                      })}
                      maxLength={1024}
                      className='min-h-20 w-full resize-y rounded border bg-background p-2 font-mono text-[11px]'
                      value={expression.source}
                      onChange={(e) => set(name, e.target.value)}
                    />
                    {!compileMaterialExpression(expression.source) ? (
                      <p className='text-[11px] text-amber-400'>
                        {t("modelEditor.reactive.previewLimited")}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
      </fieldset>
    </details>
  );
}
