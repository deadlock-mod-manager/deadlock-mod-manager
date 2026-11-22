import { GLOBAL_PRESETS } from "./presets/global";
import { HISTORY_PRESETS } from "./presets/history";
import type { PresetDef, PresetParams } from "./presets/kit";
import { PLAYER_PRESETS } from "./presets/player";

export {
  DashboardSchemaError,
  PRESET_CATEGORIES,
  type PresetDef,
  type PresetParams,
  type PresetQuery,
} from "./presets/kit";

export const PRESETS: readonly PresetDef[] = [
  ...HISTORY_PRESETS,
  ...PLAYER_PRESETS,
  ...GLOBAL_PRESETS,
];

const presetsById = new Map(PRESETS.map((preset) => [preset.id, preset]));

export const presetById = (id: string): PresetDef | undefined =>
  presetsById.get(id);

export const defaultParams = (preset: PresetDef): PresetParams =>
  Object.fromEntries(preset.params.map((param) => [param.key, param.default]));
