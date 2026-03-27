import { HsvColorPickerDialog } from "@/components/hsv-color-picker";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const DEFAULT_LINE_COLOR = "#6b7280";

export const LineColorPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className='flex items-center gap-3'>
      <label className='text-sm font-medium'>
        {t("plugins.themes.lineColor")}
      </label>
      <div className='inline-flex items-center justify-center rounded-md border border-input/70 p-1 leading-none'>
        <button
          type='button'
          onClick={() => setOpen(true)}
          className='block h-7 w-10 rounded-sm bg-transparent'
          aria-label={t("plugins.themes.pickColor") ?? "Pick color"}
          style={{ backgroundColor: value }}
        />
      </div>

      <HsvColorPickerDialog
        open={open}
        onOpenChange={setOpen}
        colorHex={value}
        fallbackHex={DEFAULT_LINE_COLOR}
        title={t("plugins.themes.lineColorDialogTitle")}
        description={t("plugins.themes.lineColorDialogDescription")}
        onApply={onChange}
        onEyedropperPick={onChange}
      />
    </div>
  );
};
