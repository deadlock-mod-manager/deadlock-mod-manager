import {
  hexToRgb,
  HsvColorPickerDialog,
  isValidHex,
  normalizeHex,
  rgbToHex,
} from "@/components/hsv-color-picker";
import { Input } from "@deadlock-mods/ui/components/input";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface ColorPickerProps {
  readonly color: {
    readonly r: number;
    readonly g: number;
    readonly b: number;
  };
  readonly onChange: (color: { r: number; g: number; b: number }) => void;
}

const DEFAULT_CROSSHAIR_HEX = "#ffffff";

export function ColorPicker({ color, onChange }: ColorPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hexValue = rgbToHex(color.r, color.g, color.b);
  const displayHex = hexValue.toUpperCase();
  const [draftHex, setDraftHex] = useState(displayHex);

  useEffect(() => {
    setDraftHex(displayHex);
  }, [displayHex]);

  const applyHex = (hex: string): boolean => {
    const rgb = hexToRgb(hex);
    if (rgb === null) {
      return false;
    }
    onChange({ r: rgb.r, g: rgb.g, b: rgb.b });
    return true;
  };

  const handleEyedropperPick = (_hex: string) => {};

  const finalizeDraftHex = () => {
    const trimmed = draftHex.trim();
    if (isValidHex(trimmed)) {
      const normalized = normalizeHex(trimmed, DEFAULT_CROSSHAIR_HEX);
      if (applyHex(normalized)) {
        setDraftHex(normalized.toUpperCase());
        return;
      }
    }
    setDraftHex(displayHex);
  };

  const handleHexKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finalizeDraftHex();
    }
  };

  return (
    <div className='space-y-2'>
      <div className='flex gap-2'>
        <div className='inline-flex h-10 shrink-0 items-stretch justify-center overflow-hidden rounded-md border border-input/70 leading-none'>
          <button
            type='button'
            onClick={() => setOpen(true)}
            className='block h-full w-20 cursor-pointer bg-transparent'
            aria-label={t("crosshairs.form.colorDialogTitle")}
            style={{ backgroundColor: hexValue }}
          />
        </div>
        <Input
          id='crosshair-color-hex'
          type='text'
          value={draftHex}
          onChange={(e) => {
            setDraftHex(e.target.value);
          }}
          onBlur={finalizeDraftHex}
          onKeyDown={handleHexKeyDown}
          placeholder={t("crosshairs.form.hexPlaceholder")}
          className='min-w-0 flex-1 font-mono'
          maxLength={7}
          spellCheck={false}
          aria-label={t("crosshairs.form.hexColorInputLabel")}
        />
      </div>

      <HsvColorPickerDialog
        open={open}
        onOpenChange={setOpen}
        colorHex={hexValue}
        fallbackHex={DEFAULT_CROSSHAIR_HEX}
        title={t("crosshairs.form.colorDialogTitle")}
        description={t("crosshairs.form.colorDialogDescription")}
        onApply={applyHex}
        onEyedropperPick={handleEyedropperPick}
      />
    </div>
  );
}
