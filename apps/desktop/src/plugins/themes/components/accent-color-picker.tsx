import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HsvColorPickerDialog,
  isValidHex,
  normalizeHex,
} from "@/components/hsv-color-picker";

const sameHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

type AccentColorPickerProps = {
  value: string | undefined;
  defaultColor: string;
  presets: readonly string[];
  customColors: string[];
  dialogTitle: string;
  dialogDescription: string;
  /** Receives the new accent plus the custom swatch list to persist with it. */
  onChange: (color: string, customColors: string[]) => void;
};

export const AccentColorPicker = ({
  value,
  defaultColor,
  presets,
  customColors,
  dialogTitle,
  dialogDescription,
  onChange,
}: AccentColorPickerProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const allColors = useMemo(() => {
    const colors: string[] = [...presets];
    for (const custom of customColors) {
      if (!isValidHex(custom)) continue;
      const normalized = normalizeHex(custom, defaultColor);
      if (!colors.some((c) => sameHex(c, normalized))) {
        colors.push(normalized);
      }
    }
    return colors;
  }, [presets, customColors, defaultColor]);

  const selectedColor =
    value && isValidHex(value)
      ? normalizeHex(value, defaultColor)
      : defaultColor;
  const isDefault = sameHex(selectedColor, defaultColor);

  const selectColor = (hex: string) => onChange(hex, customColors);

  // Picker results become a custom swatch unless a preset or saved swatch already matches.
  const commitAccent = (hex: string) => {
    const known = allColors.some((c) => sameHex(c, hex));
    onChange(hex, known ? customColors : [...customColors, hex]);
  };

  return (
    <div className='flex flex-col gap-2 mt-2 mb-2'>
      <span className='text-xs text-muted-foreground'>
        {t("plugins.themes.accentColor")}
      </span>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
          {allColors.map((color) => (
            <button
              key={color}
              type='button'
              onClick={() => selectColor(color)}
              className='relative w-6 h-6 rounded-full border border-border/50 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
              style={{ backgroundColor: color }}
              aria-label={color}>
              {sameHex(selectedColor, color) && (
                <CheckIcon
                  className='absolute inset-0 m-auto text-white drop-shadow-md'
                  size={14}
                  weight='bold'
                />
              )}
            </button>
          ))}
          <button
            type='button'
            onClick={() => setOpen(true)}
            className='w-6 h-6 rounded-full border border-dashed border-border/70 flex items-center justify-center transition-transform hover:scale-110 hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 bg-background/50'
            aria-label={t("plugins.themes.addCustomColor")}>
            <PlusIcon size={14} className='text-muted-foreground' />
          </button>
        </div>
        <button
          type='button'
          onClick={() => selectColor(defaultColor)}
          disabled={isDefault}
          className='inline-flex h-6 shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40'>
          <ArrowCounterClockwiseIcon size={12} />
          {t("plugins.themes.resetAccent")}
        </button>
      </div>

      <HsvColorPickerDialog
        open={open}
        onOpenChange={setOpen}
        colorHex={selectedColor}
        fallbackHex={defaultColor}
        title={dialogTitle}
        description={dialogDescription}
        onApply={commitAccent}
        onEyedropperPick={commitAccent}
      />
    </div>
  );
};
