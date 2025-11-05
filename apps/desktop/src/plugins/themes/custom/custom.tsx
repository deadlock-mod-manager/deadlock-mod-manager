// This file is deprecated - use the modular structure in individual files
// Re-export everything from the new modular structure

export { LineColorPicker } from "./color-picker";
export { default as CustomTheme } from "./custom-theme";
export { ExportCustomThemeButton } from "./export-dialog";
export type {
  CustomExportedTheme,
  CustomThemeProps,
  ThemeSettings,
} from "./types";
export {
  beginEditingUserTheme,
  cancelEditingUserTheme,
  deleteUserTheme,
  getUserThemes,
  saveEditingUserTheme,
} from "./utils";
