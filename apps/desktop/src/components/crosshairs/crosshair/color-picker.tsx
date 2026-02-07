import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { useTranslation } from "react-i18next";

interface ColorPickerProps {
  color: { r: number; g: number; b: number };
  onChange: (color: { r: number; g: number; b: number }) => void;
}

export function ColorPicker({ color, onChange }: ColorPickerProps) {
  const { t } = useTranslation();
  const hexValue = rgbToHex(color.r, color.g, color.b);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    const rgb = hexToRgb(hex);
    if (rgb) {
      onChange(rgb);
    }
  };

  return (
    <div className='space-y-2'>
      <Label htmlFor='color-picker'>Color (Hex)</Label>
      <div className='flex gap-2'>
        <Input
          id='color-picker'
          type='color'
          value={hexValue}
          onChange={handleHexChange}
          className='w-20 h-10 cursor-pointer'
        />
        <Input
          type='text'
          value={hexValue}
          onChange={handleHexChange}
          placeholder={t("crosshairs.form.hexPlaceholder")}
          className='flex-1 font-mono'
          maxLength={7}
        />
      </div>
    </div>
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null;
}
