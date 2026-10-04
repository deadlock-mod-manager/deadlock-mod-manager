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
  releaseThemeDismissed?: boolean;
  /** `false` opts out of seasonal themes for good. */
  seasonalThemes?: boolean;
  /** Occurrence key of a seasonal theme turned off until it comes round again. */
  seasonalDismissed?: string;
  /** Hidden seasonal items found, keyed by `<themeId>:<year>`. */
  seasonalFinds?: Record<string, string[]>;
  /** Advent calendar doors opened, keyed by year. */
  adventDoors?: Record<string, number[]>;
  /** Lucky coins from Lunar New Year red envelopes, keyed by year. */
  luckyCoins?: Record<string, number>;
  previousActiveTheme?: string;
  customTheme?: Partial<CustomThemePalette>;
  userThemes?: CustomExportedTheme[];
  editingThemeId?: string;
  arcaneAccentColor?: string;
  oledAccentColor?: string;
  arcaneCustomColors?: string[];
  oledCustomColors?: string[];
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
