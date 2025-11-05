// This file is deprecated - use the modular structure in individual files
// Re-export everything from the new modular structure
export { default as CustomTheme } from "./custom-theme";
export { ExportCustomThemeButton } from "./export-dialog";
export { LineColorPicker } from "./color-picker";
export {
  beginEditingUserTheme,
  cancelEditingUserTheme,
  deleteUserTheme,
  getUserThemes,
  saveEditingUserTheme,
} from "./utils";
export type { CustomExportedTheme, CustomThemeProps, ThemeSettings } from "./types";
