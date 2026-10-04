import { Button } from "@deadlock-mods/ui/components/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HsvColorPickerDialog,
  normalizeHex,
} from "@/components/hsv-color-picker";
import { DEFAULT_OLED_ACCENT } from "./accent";

type OledAccentPickerProps = {
  value: string;
  onChange: (color: string) => void;
};

export function OledAccentPicker({ value, onChange }: OledAccentPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const color = normalizeHex(value, DEFAULT_OLED_ACCENT);

  return (
    <div className='flex flex-col gap-2'>
      <span className='text-xs text-muted-foreground'>
        {t("plugins.oled.accentColor")}
      </span>
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          onClick={() => setOpen(true)}
          aria-label={t("plugins.oled.customColor")}>
          <span
            aria-hidden
            className='size-4 rounded-full border border-border'
            style={{ backgroundColor: color }}
          />
          {color.toUpperCase()}
        </Button>
        <Button
          variant='ghost'
          onClick={() => onChange(DEFAULT_OLED_ACCENT)}
          disabled={color.toLowerCase() === DEFAULT_OLED_ACCENT.toLowerCase()}>
          {t("plugins.oled.resetAccent")}
        </Button>
      </div>
      <HsvColorPickerDialog
        open={open}
        onOpenChange={setOpen}
        colorHex={color}
        fallbackHex={DEFAULT_OLED_ACCENT}
        title={t("plugins.oled.customColor")}
        description={t("plugins.oled.customColorDescription")}
        onApply={onChange}
        onEyedropperPick={onChange}
      />
    </div>
  );
}
