export enum ModCategory {
  SKINS = "Skins",
  GAMEPLAY_MODIFICATIONS = "Gameplay Modifications",
  HUD = "HUD",
  MODEL_REPLACEMENT = "Model Replacement",
  MUSIC = "Music",
  ABILITY_SOUNDS = "Abilities",
  WEAPON_SOUNDS = "Weapons",
  VOICE_LINES = "VOs",
  KILL_SOUNDS = "Killsounds",
  KILLSTREAK_MUSIC = "Killstreak Music",
  OTHER_MISC = "Other/Misc",
}

export const MOD_CATEGORY_ORDER = [
  ModCategory.SKINS,
  ModCategory.GAMEPLAY_MODIFICATIONS,
  ModCategory.HUD,
  ModCategory.MODEL_REPLACEMENT,
  ModCategory.MUSIC,
  ModCategory.ABILITY_SOUNDS,
  ModCategory.WEAPON_SOUNDS,
  ModCategory.VOICE_LINES,
  ModCategory.KILL_SOUNDS,
  ModCategory.KILLSTREAK_MUSIC,
  ModCategory.OTHER_MISC,
] as const;

export const MOD_CATEGORY_VALUE_SET = new Set<string>(MOD_CATEGORY_ORDER);

export function getModCategoryDisplayName(category: string): string {
  switch (category) {
    case ModCategory.GAMEPLAY_MODIFICATIONS:
      return "Gameplay";
    case ModCategory.MODEL_REPLACEMENT:
      return "Models";
    case ModCategory.OTHER_MISC:
      return "Other";
    case ModCategory.ABILITY_SOUNDS:
      return "Ability Sounds";
    case ModCategory.WEAPON_SOUNDS:
      return "Weapon Sounds";
    case ModCategory.VOICE_LINES:
      return "Voice Lines";
    case ModCategory.KILL_SOUNDS:
      return "Kill Sounds";
    default:
      return category;
  }
}
