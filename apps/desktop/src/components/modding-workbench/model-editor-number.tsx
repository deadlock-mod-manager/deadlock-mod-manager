import { Input } from "@deadlock-mods/ui/components/input";
import { useTranslation } from "react-i18next";

export function ModelEditorNumber({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className='grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3 text-xs'>
      <span className='min-w-0 leading-5 text-muted-foreground'>
        {t(label)}
      </span>
      <Input
        type='number'
        className='h-8 min-w-0 px-2 font-mono text-right text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next))
            onChange(Math.max(min, Math.min(max, next)));
        }}
      />
    </label>
  );
}
