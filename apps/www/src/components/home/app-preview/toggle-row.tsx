import { Switch } from "@deadlock-mods/ui/components/switch";

export const ToggleRow = ({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <label className='flex cursor-pointer items-center justify-between gap-6'>
    <span className='space-y-1'>
      <span className='block font-bold text-sm'>{label}</span>
      <span className='block text-muted-foreground text-sm'>{description}</span>
    </span>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </label>
);
