import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { ModdingMaterialControl } from "@/types/generated/ModdingMaterialControl";

export function ModelParameterControl({
  control,
  override,
  onChange,
}: {
  control: ModdingMaterialControl;
  override: number[] | undefined;
  onChange: (values: number[] | null) => void;
}) {
  const { t } = useTranslation();
  const values = override ?? control.values;
  const label = t(`modelEditor.parameters.${control.name}`);
  const dynamic = control.expression !== null;
  const update = (index: number, value: number) => {
    if (Number.isFinite(value) && value >= control.min && value <= control.max)
      onChange(values.map((v, i) => (i === index ? value : v)));
  };
  return (
    <div className='space-y-2 text-xs'>
      <div className='flex items-center gap-2'>
        <label
          className='flex min-w-0 flex-1 items-center gap-2'
          title={control.name}>
          <input
            type='checkbox'
            disabled={dynamic}
            checked={
              control.kind === "flag" ? values[0] !== 0 : override !== undefined
            }
            onChange={(e) =>
              onChange(
                control.kind === "flag"
                  ? [e.target.checked ? 1 : 0]
                  : e.target.checked
                    ? [...values]
                    : null,
              )
            }
          />
          <span>{label}</span>
        </label>
        {control.kind === "scalar" && override ? (
          <Input
            type='number'
            aria-label={label}
            min={control.min}
            max={control.max}
            step={0.001}
            value={values[0]}
            onChange={(e) => update(0, e.target.valueAsNumber)}
            className='h-7 w-20 px-2 font-mono text-xs'
          />
        ) : null}
        {override ? (
          <Button
            size='icon'
            variant='ghost'
            className='size-6 shrink-0'
            aria-label={t("modelEditor.restoreParameter", { parameter: label })}
            onClick={() => onChange(null)}>
            <ArrowCounterClockwiseIcon />
          </Button>
        ) : null}
      </div>
      {dynamic ? (
        <p className='break-all font-mono text-[10px] text-muted-foreground'>
          {control.expression}
        </p>
      ) : null}
      {override && control.kind === "scalar" ? (
        <Slider
          aria-label={label}
          min={control.min}
          max={control.max}
          step={0.001}
          value={[values[0]]}
          onValueChange={([v]) => update(0, v)}
        />
      ) : null}
      {override && control.kind === "color" ? (
        <input
          type='color'
          aria-label={label}
          className='h-8 w-full rounded border bg-background'
          value={`#${values
            .slice(0, 3)
            .map((v) =>
              Math.round(Math.max(0, Math.min(1, v)) * 255)
                .toString(16)
                .padStart(2, "0"),
            )
            .join("")}`}
          onChange={(e) =>
            onChange([
              ...[1, 3, 5].map(
                (i) =>
                  Number.parseInt(e.target.value.slice(i, i + 2), 16) / 255,
              ),
              values[3] ?? 0,
            ])
          }
        />
      ) : null}
      {override && control.kind === "vector" ? (
        <div className='grid grid-cols-3 gap-1'>
          {values.slice(0, 3).map((value, index) => (
            <Input
              key={`${control.name}-${["x", "y", "z"][index]}`}
              type='number'
              aria-label={`${label} ${index + 1}`}
              min={control.min}
              max={control.max}
              step={0.01}
              value={value}
              className='h-7 px-1 font-mono text-xs'
              onChange={(e) => update(index, e.target.valueAsNumber)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
