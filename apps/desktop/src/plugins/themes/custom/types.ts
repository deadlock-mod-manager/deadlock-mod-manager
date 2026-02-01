export type ThemeSettings = {
  activeSection: "pre-defined" | "custom";
  activeTheme?: string;
  customTheme?: {
    lineColor: string;
    iconData?: string;
    backgroundSource?: "url" | "local";
    backgroundUrl?: string;
    backgroundData?: string;
    backgroundOpacity?: number;
  };
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
  lineColor: string;
  iconData?: string;
  backgroundSource?: "url" | "local";
  backgroundUrl?: string;
  backgroundData?: string;
  backgroundOpacity?: number;
  userCreated: true;
};

export type CustomThemeProps = { theme?: CustomExportedTheme };
