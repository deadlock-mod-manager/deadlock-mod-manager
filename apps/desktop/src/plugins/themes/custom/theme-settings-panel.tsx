import { Slider } from "@deadlock-mods/ui/components/slider";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { ThemeColorPicker } from "./color-picker";
import { DEFAULT_CUSTOM_THEME } from "./theme-defaults";
import type { CustomThemePalette } from "./types";

export type ThemeSettingsPanelProps = {
  palette: CustomThemePalette;
  onPaletteChange: (patch: Partial<CustomThemePalette>) => void;
};

export function ThemeSettingsPanel({
  palette,
  onPaletteChange,
}: ThemeSettingsPanelProps) {
  const { t } = useTranslation();
  const fb = DEFAULT_CUSTOM_THEME;

  const sectionTitle =
    "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <div className='flex flex-col gap-4'>
      <section className='flex flex-col gap-2'>
        <h3 className={sectionTitle}>{t("plugins.themes.sectionAccent")}</h3>
        <ThemeColorPicker
          dialogDescription={t("plugins.themes.accentColorDialogDescription")}
          dialogTitle={t("plugins.themes.accentColorDialogTitle")}
          fallbackHex={fb.accentColor}
          label={t("plugins.themes.accentColor")}
          value={palette.accentColor}
          onChange={(hex) => onPaletteChange({ accentColor: hex })}
        />
      </section>

      <section className='flex flex-col gap-2 border-t border-border/60 pt-4'>
        <h3 className={sectionTitle}>{t("plugins.themes.sectionBorder")}</h3>
        <ThemeColorPicker
          dialogDescription={t("plugins.themes.lineColorDialogDescription")}
          dialogTitle={t("plugins.themes.lineColorDialogTitle")}
          fallbackHex={fb.lineColor}
          label={t("plugins.themes.lineColor")}
          value={palette.lineColor}
          onChange={(hex) => onPaletteChange({ lineColor: hex })}
        />
      </section>

      <section className='flex flex-col gap-3 border-t border-border/60 pt-4'>
        <h3 className={sectionTitle}>{t("plugins.themes.sectionSurfaces")}</h3>
        <div className='grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2'>
          <ThemeColorPicker
            dialogDescription={t("plugins.themes.cardColorDialogDescription")}
            dialogTitle={t("plugins.themes.cardColorDialogTitle")}
            fallbackHex={fb.cardColor}
            label={t("plugins.themes.cardColor")}
            value={palette.cardColor}
            onChange={(hex) => onPaletteChange({ cardColor: hex })}
          />
          <ThemeColorPicker
            dialogDescription={t(
              "plugins.themes.popoverColorDialogDescription",
            )}
            dialogTitle={t("plugins.themes.popoverColorDialogTitle")}
            fallbackHex={fb.popoverColor}
            label={t("plugins.themes.popoverColor")}
            value={palette.popoverColor}
            onChange={(hex) => onPaletteChange({ popoverColor: hex })}
          />
          <ThemeColorPicker
            dialogDescription={t(
              "plugins.themes.secondaryColorDialogDescription",
            )}
            dialogTitle={t("plugins.themes.secondaryColorDialogTitle")}
            fallbackHex={fb.secondaryColor}
            label={t("plugins.themes.secondaryColor")}
            value={palette.secondaryColor}
            onChange={(hex) => onPaletteChange({ secondaryColor: hex })}
          />
          <ThemeColorPicker
            dialogDescription={t("plugins.themes.mutedColorDialogDescription")}
            dialogTitle={t("plugins.themes.mutedColorDialogTitle")}
            fallbackHex={fb.mutedColor}
            label={t("plugins.themes.mutedColor")}
            value={palette.mutedColor}
            onChange={(hex) => onPaletteChange({ mutedColor: hex })}
          />
        </div>
      </section>

      <section className='flex flex-col gap-3 border-t border-border/60 pt-4'>
        <h3 className={sectionTitle}>{t("plugins.themes.sectionText")}</h3>
        <div className='grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2'>
          <ThemeColorPicker
            dialogDescription={t(
              "plugins.themes.foregroundColorDialogDescription",
            )}
            dialogTitle={t("plugins.themes.foregroundColorDialogTitle")}
            fallbackHex={fb.foregroundColor}
            label={t("plugins.themes.foregroundColor")}
            value={palette.foregroundColor}
            onChange={(hex) => onPaletteChange({ foregroundColor: hex })}
          />
          <ThemeColorPicker
            dialogDescription={t(
              "plugins.themes.mutedForegroundColorDialogDescription",
            )}
            dialogTitle={t("plugins.themes.mutedForegroundColorDialogTitle")}
            fallbackHex={fb.mutedForegroundColor}
            label={t("plugins.themes.mutedForegroundColor")}
            value={palette.mutedForegroundColor}
            onChange={(hex) => onPaletteChange({ mutedForegroundColor: hex })}
          />
        </div>
      </section>

      <section className='flex flex-col gap-4 border-t border-border/60 pt-4'>
        <h3 className={sectionTitle}>{t("plugins.themes.sectionAdvanced")}</h3>

        <div className='flex flex-col gap-1.5'>
          <span className='text-sm font-medium'>
            {t("plugins.themes.sidebarOpacity")}
          </span>
          <Slider
            aria-label={t("plugins.themes.sidebarOpacity")}
            max={100}
            min={0}
            onValueChange={(value) =>
              onPaletteChange({ sidebarOpacity: value[0] })
            }
            step={1}
            value={[palette.sidebarOpacity]}
          />
        </div>

        <div className='flex flex-col gap-3'>
          <div className='flex items-center justify-between gap-3'>
            <span className={sectionTitle}>
              {t("plugins.themes.sectionAmbientBackground")}
            </span>
            <Switch
              checked={palette.ambientBackgroundEnabled}
              onCheckedChange={(checked) =>
                onPaletteChange({ ambientBackgroundEnabled: checked })
              }
            />
          </div>
          <ThemeColorPicker
            dialogDescription={t(
              "plugins.themes.ambientAccentColorDialogDescription",
            )}
            dialogTitle={t("plugins.themes.ambientAccentColorDialogTitle")}
            fallbackHex={fb.ambientAccentColor}
            label={t("plugins.themes.ambientAccentColor")}
            value={palette.ambientAccentColor}
            onChange={(hex) => onPaletteChange({ ambientAccentColor: hex })}
          />
          <div className='flex flex-col gap-1.5'>
            <span className='text-sm font-medium'>
              {t("plugins.themes.ambientIntensity")}
            </span>
            <Slider
              aria-label={t("plugins.themes.ambientIntensity")}
              disabled={!palette.ambientBackgroundEnabled}
              max={36}
              min={0}
              onValueChange={(value) =>
                onPaletteChange({ ambientIntensity: value[0] })
              }
              step={1}
              value={[palette.ambientIntensity]}
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <span className='text-sm font-medium'>
              {t("plugins.themes.ambientSpread")}
            </span>
            <Slider
              aria-label={t("plugins.themes.ambientSpread")}
              disabled={!palette.ambientBackgroundEnabled}
              max={20}
              min={0}
              onValueChange={(value) =>
                onPaletteChange({ ambientSpread: value[0] })
              }
              step={1}
              value={[palette.ambientSpread]}
            />
          </div>
        </div>

        <div className='flex flex-col gap-1.5'>
          <span className='text-sm font-medium'>
            {t("plugins.themes.cornerRadius")}
          </span>
          <Slider
            aria-label={t("plugins.themes.cornerRadius")}
            max={16}
            min={4}
            onValueChange={(value) =>
              onPaletteChange({ cornerRadiusPx: value[0] })
            }
            step={1}
            value={[palette.cornerRadiusPx]}
          />
        </div>
      </section>
    </div>
  );
}
