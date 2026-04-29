import { HsvColorPickerDialog } from "@/components/hsv-color-picker";
import { useState } from "react";

type ThemeColorPickerProps = {
  label: string;
  value: string;
  fallbackHex: string;
  dialogTitle: string;
  dialogDescription: string;
  onChange: (hex: string) => void;
};

export function ThemeColorPicker({
  label,
  value,
  fallbackHex,
  dialogTitle,
  dialogDescription,
  onChange,
}: ThemeColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-sm font-medium'>{label}</span>
      <div className='flex items-center gap-3'>
        <div className='inline-flex items-center justify-center rounded-md border border-input/70 p-1 leading-none'>
          <button
            type='button'
            onClick={() => setOpen(true)}
            className='block h-7 w-10 rounded-sm bg-transparent'
            aria-label={dialogTitle}
            style={{ backgroundColor: value }}
          />
        </div>

        <HsvColorPickerDialog
          open={open}
          onOpenChange={setOpen}
          colorHex={value}
          fallbackHex={fallbackHex}
          title={dialogTitle}
          description={dialogDescription}
          onApply={onChange}
          onEyedropperPick={onChange}
        />
      </div>
    </div>
  );
}
