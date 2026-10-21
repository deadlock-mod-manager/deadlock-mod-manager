import {
  type ModDto,
  PERFORMANCE_CONFIG_CATEGORY,
} from "@deadlock-mods/shared";
import { ModCategory } from "@/lib/constants";

const HINT_CATEGORIES: ReadonlySet<string> = new Set([
  "Quality of Life/Fixes",
  ModCategory.OTHER_MISC,
]);

const HINT_PATTERN =
  /\b(gameinfo|cfg|configs?|fps|optimi[sz](ations?|ed)|potato)\b/i;

/**
 * `confirmed`: a listed or flagged performance config, installed through the
 * Performance page instead of as a mod. `likely`: its name or tags read like
 * one, so the mod page points to Performance but keeps Install.
 */
export type ConfigListing = "confirmed" | "likely";

export const configListing = (
  mod: Pick<ModDto, "remoteId" | "category" | "name" | "tags">,
  catalogGameBananaIds: ReadonlySet<string>,
): ConfigListing | null => {
  if (
    mod.category === PERFORMANCE_CONFIG_CATEGORY ||
    catalogGameBananaIds.has(mod.remoteId)
  ) {
    return "confirmed";
  }
  if (!HINT_CATEGORIES.has(mod.category)) return null;
  const text = [mod.name, ...(mod.tags ?? [])].join(" ");
  return HINT_PATTERN.test(text) ? "likely" : null;
};
