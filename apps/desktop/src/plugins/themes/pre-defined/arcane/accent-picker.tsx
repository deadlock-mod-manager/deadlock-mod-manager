import {
  HsvColorPickerDialog,
  isValidHex,
  normalizeHex,
} from "@/components/hsv-color-picker";
import { Check, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const PREDEFINED_COLORS = [
  "#8B5CF6",
  "#E8416F",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#3B82F6",
] as const;

const DEFAULT_ACCENT_COLOR = "#E8416F";

type ArcaneAccentPickerProps = {
  value: string;
  customColors: string[];
  onChange: (color: string) => void;
  onAddCustomColor: (color: string) => void;
};

export const ArcaneAccentPicker = ({
  value,
  customColors,
  onChange,
  onAddCustomColor,
}: ArcaneAccentPickerProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const allColors = useMemo(() => {
    const colors: string[] = [...PREDEFINED_COLORS];
    for (const custom of customColors) {
      if (!isValidHex(custom)) continue;
      const normalized = normalizeHex(custom, DEFAULT_ACCENT_COLOR);
      if (!colors.some((c) => c.toLowerCase() === normalized.toLowerCase())) {
        colors.push(normalized);
      }
    }
    return colors;
  }, [customColors]);

  const selectedColor = value || DEFAULT_ACCENT_COLOR;

  const commitAccent = (hex: string) => {
    onAddCustomColor(hex);
    onChange(hex);
  };

  return (
    <div className='flex flex-col gap-2 mt-2 mb-2'>
      <span className='text-xs text-muted-foreground'>
        {t("plugins.arcane.accentColor")}
      </span>
      <div className='flex flex-wrap items-center gap-1.5'>
        {allColors.map((color) => (
          <button
            key={color}
            type='button'
            onClick={() => onChange(color)}
            className='relative w-6 h-6 rounded-full border border-border/50 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
            style={{ backgroundColor: color }}
            aria-label={color}>
            {selectedColor.toLowerCase() === color.toLowerCase() && (
              <Check
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
          aria-label={t("plugins.arcane.addCustomColor") ?? "Add custom color"}>
          <Plus size={14} className='text-muted-foreground' />
        </button>
      </div>

      <HsvColorPickerDialog
        open={open}
        onOpenChange={setOpen}
        colorHex={isValidHex(value) ? value : DEFAULT_ACCENT_COLOR}
        fallbackHex={DEFAULT_ACCENT_COLOR}
        title={t("plugins.arcane.customColor")}
        description={t("plugins.arcane.customColorDescription")}
        onApply={commitAccent}
        onEyedropperPick={commitAccent}
      />
    </div>
  );
};

export { DEFAULT_ACCENT_COLOR, PREDEFINED_COLORS };
