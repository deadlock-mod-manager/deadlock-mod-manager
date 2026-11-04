import { Switch } from "@deadlock-mods/ui/components/switch";

export const SwitchRow = ({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <label className='flex items-center gap-3'>
    <span className='min-w-0 flex-1'>
      <span className='block font-medium text-xs'>{label}</span>
      <span className='block text-[11px] text-muted-foreground'>{hint}</span>
    </span>
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    />
  </label>
);
