import { Input } from "@deadlock-mods/ui/components/input";
import { useTranslation } from "react-i18next";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";

const MODEL_PATTERN_STYLES = [
  "liquid",
  "moire",
  "kaleido",
  "holo",
  "glitch",
  "thermal",
  "camo",
  "carbon",
  "galaxy",
  "halftone",
  "lava",
  "vaporwave",
  "viscous",
  "darkmatter",
  "monochrome",
  "deco",
  "frost",
  "circuit",
] as const;
export function ModelMaterialPatterns({
  edit,
  disabled,
  onChange,
}: {
  edit: ModdingModelPartEdit;
  disabled: boolean;
  onChange: (edit: ModdingModelPartEdit) => void;
}) {
  const { t } = useTranslation();
  const pattern = edit.pattern;
  return (
    <details className='border-t p-3 text-xs'>
      <summary className='cursor-pointer font-medium leading-5'>
        {t("modelEditor.patterns.title")}
      </summary>
      <fieldset disabled={disabled} className='mt-3 min-w-0 space-y-3'>
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            checked={!!pattern}
            onChange={(e) =>
              onChange({
                ...edit,
                parameters: edit.parameters.filter(
                  (p) => p.name !== "g_vAlbedoScrollSpeed1",
                ),
                expressions: edit.expressions.filter(
                  (p) => p.name !== "g_vAlbedoScrollSpeed1",
                ),
                pattern: e.target.checked
                  ? {
                      style: "liquid",
                      intensity: 0.7,
                      phase: 0,
                      scroll: [0, 0],
                    }
                  : null,
              })
            }
          />
          {t("modelEditor.patterns.enable")}
        </label>
        {pattern ? (
          <>
            <select
              className='h-8 w-full rounded border bg-background px-2'
              aria-label={t("modelEditor.patterns.style")}
              value={pattern.style}
              onChange={(e) =>
                onChange({
                  ...edit,
                  pattern: { ...pattern, style: e.target.value },
                })
              }>
              {MODEL_PATTERN_STYLES.map((style) => (
                <option key={style} value={style}>
                  {t(`modelEditor.patterns.styles.${style}`)}
                </option>
              ))}
            </select>
            {(["intensity", "phase"] as const).map((key) => (
              <label
                key={key}
                className='flex items-center justify-between gap-2'>
                {t(`modelEditor.patterns.${key}`)}
                <Input
                  type='number'
                  min={0}
                  max={1}
                  step={0.01}
                  value={pattern[key]}
                  className='h-7 w-20 px-2 font-mono text-xs'
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    if (Number.isFinite(v) && v >= 0 && v <= 1)
                      onChange({ ...edit, pattern: { ...pattern, [key]: v } });
                  }}
                />
              </label>
            ))}
            <div className='grid grid-cols-2 gap-2'>
              {([0, 1] as const).map((i) => (
                <label key={i} className='space-y-1'>
                  {t(
                    i === 0
                      ? "modelEditor.patterns.scrollX"
                      : "modelEditor.patterns.scrollY",
                  )}
                  <Input
                    type='number'
                    min={-2}
                    max={2}
                    step={0.01}
                    value={pattern.scroll[i]}
                    className='h-7 px-2 font-mono text-xs'
                    onChange={(e) => {
                      const v = e.target.valueAsNumber;
                      if (Number.isFinite(v) && v >= -2 && v <= 2)
                        onChange({
                          ...edit,
                          pattern: {
                            ...pattern,
                            scroll:
                              i === 0
                                ? [v, pattern.scroll[1]]
                                : [pattern.scroll[0], v],
                          },
                        });
                    }}
                  />
                </label>
              ))}
            </div>
            <p className='text-[11px] text-muted-foreground'>
              {t("modelEditor.patterns.hint")}
            </p>
          </>
        ) : null}
      </fieldset>
    </details>
  );
}
