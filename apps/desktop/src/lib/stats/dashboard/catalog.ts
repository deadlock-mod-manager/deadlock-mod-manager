import { GLOBAL_PRESETS } from "./presets/global";
import { HISTORY_PRESETS } from "./presets/history";
import type { PresetDef, PresetParams } from "./presets/kit";
import { PLAYER_PRESETS } from "./presets/player";

/**
 * The ready-made values the "+" dialog offers, grouped in `presets/` by where
 * their data comes from. Every remote preset declares the fields it reads as
 * required: when deadlock-api renames or drops one, the response stops parsing
 * and the widget reports the endpoint as changed instead of drawing zeros.
 *
 * Last checked against the live API on 2026-10-15. Rerun with
 * `pnpm check:dashboard-endpoints`; the stats-dashboard-endpoints skill covers
 * fixing what it finds.
 */

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
