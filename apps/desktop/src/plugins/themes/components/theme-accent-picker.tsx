import { useTranslation } from "react-i18next";
import type { ThemeSettings } from "../custom";
import {
  ARCANE_ACCENT_PRESETS,
  DEFAULT_ARCANE_ACCENT,
} from "../pre-defined/arcane/accent";
import {
  DEFAULT_OLED_ACCENT,
  OLED_ACCENT_PRESETS,
} from "../pre-defined/oled/accent";
import { AccentColorPicker } from "./accent-color-picker";

type AccentThemeConfig = {
  colorKey: "arcaneAccentColor" | "oledAccentColor";
  customColorsKey: "arcaneCustomColors" | "oledCustomColors";
  defaultColor: string;
  presets: readonly string[];
  dialogTitleKey: string;
  dialogDescriptionKey: string;
};

const ACCENT_THEMES = new Map<string, AccentThemeConfig>([
  [
    "arcane",
    {
      colorKey: "arcaneAccentColor",
      customColorsKey: "arcaneCustomColors",
      defaultColor: DEFAULT_ARCANE_ACCENT,
      presets: ARCANE_ACCENT_PRESETS,
      dialogTitleKey: "plugins.arcane.customColor",
      dialogDescriptionKey: "plugins.arcane.customColorDescription",
    },
  ],
  [
    "oled",
    {
      colorKey: "oledAccentColor",
      customColorsKey: "oledCustomColors",
      defaultColor: DEFAULT_OLED_ACCENT,
      presets: OLED_ACCENT_PRESETS,
      dialogTitleKey: "plugins.oled.customColor",
      dialogDescriptionKey: "plugins.oled.customColorDescription",
    },
  ],
]);

type ThemeAccentPickerProps = {
  themeId: string;
  settings: ThemeSettings;
  onChange: (patch: Partial<ThemeSettings>) => void;
};

/** Accent picker bound to a pre-defined theme's persisted settings; renders nothing for themes without an accent. */
export const ThemeAccentPicker = ({
  themeId,
  settings,
  onChange,
}: ThemeAccentPickerProps) => {
  const { t } = useTranslation();
  const config = ACCENT_THEMES.get(themeId);
  if (!config) return null;

  return (
    <AccentColorPicker
      value={settings[config.colorKey]}
      defaultColor={config.defaultColor}
      presets={config.presets}
      customColors={settings[config.customColorsKey] ?? []}
      dialogTitle={t(config.dialogTitleKey)}
      dialogDescription={t(config.dialogDescriptionKey)}
      onChange={(color, customColors) =>
        onChange({
          [config.colorKey]: color,
          [config.customColorsKey]: customColors,
        })
      }
    />
  );
};
