export type CustomThemePalette = {
  lineColor: string;
  accentColor: string;
  cardColor: string;
  popoverColor: string;
  secondaryColor: string;
  mutedColor: string;
  foregroundColor: string;
  mutedForegroundColor: string;
  sidebarOpacity: number;
  ambientBackgroundEnabled: boolean;
  ambientAccentColor: string;
  ambientIntensity: number;
  ambientSpread: number;
  cornerRadiusPx: number;
};

export type ThemeSettings = {
  activeSection: "pre-defined" | "custom";
  activeTheme?: string;
  customTheme?: Partial<CustomThemePalette>;
  userThemes?: CustomExportedTheme[];
  editingThemeId?: string;
  arcaneAccentColor?: string;
  arcaneCustomColors?: string[];
};

export type CustomExportedTheme = {
  id: string;
  name: string;
  description?: string;
  subDescription?: string;
  previewData?: string;
  userCreated: true;
} & CustomThemePalette;

export type CustomThemeProps = { theme?: CustomExportedTheme };
