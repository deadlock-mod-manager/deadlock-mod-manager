import { Slider } from "@deadlock-mods/ui/components/slider";

export const ScaleSlider = ({
  label,
  value,
  min,
  max,
  suffix = "×",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) => (
  <div className='space-y-1.5'>
    <div className='flex items-center justify-between'>
      <span className='text-xs'>{label}</span>
      <span className='font-mono text-[11px] text-muted-foreground tabular-nums'>
        {value.toFixed(2)}
        {suffix}
      </span>
    </div>
    <Slider
      max={max}
      min={min}
      onValueChange={([next]) => onChange(next)}
      step={0.05}
      value={[value]}
    />
  </div>
);
