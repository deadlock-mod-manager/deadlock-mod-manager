export const APP_NAME = 'Deadlock Mod Manager';
export const GITHUB_REPO = 'https://github.com/Stormix/deadlock-modmanager';
export const REDDIT_URL = 'https://www.reddit.com/r/DeadlockModManager/';
export const X_URL = 'https://x.com/DLModManager';
export const APP_DESCRIPTION =
  'Deadlock Mod Manager is a tool for installing and managing mods for the Valve game "Deadlock".';
export const COPYRIGHT =
  'Not affiliated with Valve. Deadlock, and the Deadlock logo are registered trademarks of Valve Corporation.';

export const STORE_NAME = 'state.json';
export const NOOP = () => {
  // Intentionally empty function
};

export enum SortType {
  DEFAULT = 'default',
  LAST_UPDATED = 'last updated',
  DOWNLOADS = 'download count',
  RATING = 'rating',
  RELEASE_DATE = 'release date',
}

export enum ModCategory {
  SKINS = 'Skins',
  GAMEPLAY_MODIFICATIONS = 'Gameplay Modifications',
  HUD = 'HUD',
  MODEL_REPLACEMENT = 'Model Replacement',
  OTHER_MISC = 'Other/Misc',
}

export const MOD_CATEGORY_ORDER = [
  ModCategory.SKINS,
  ModCategory.GAMEPLAY_MODIFICATIONS,
  ModCategory.HUD,
  ModCategory.MODEL_REPLACEMENT,
  ModCategory.OTHER_MISC,
] as const;
