import {
  type ModDto,
  PERFORMANCE_CONFIG_CATEGORY,
} from "@deadlock-mods/shared";
import { ModCategory } from "@/lib/constants";

const HINT_CATEGORIES: ReadonlySet<string> = new Set([
  "Quality of Life/Fixes",
  ModCategory.OTHER_MISC,
  ModCategory.GAMEPLAY_MODIFICATIONS,
]);

const HINT_PATTERN =
  /\b(gameinfo|cfg|configs?|fps|optimi[sz](ations?|ed)|potato)\b/i;

/**
 * `confirmed`: only a performance config, installed through the Performance
 * page instead of as a mod. `likely`: a catalog config that also ships VPKs,
 * or a listing whose name or tags read like a config. The mod page points to
 * Performance but keeps Install, which installs the VPKs and then offers to
 * import the config.
 */
export type ConfigListing = "confirmed" | "likely";

/**
 * @param catalogConfigs GameBanana ids of the catalog's community configs,
 *   mapped to whether the upload also ships VPKs.
 */
export const configListing = (
  mod: Pick<ModDto, "remoteId" | "category" | "name" | "tags">,
  catalogConfigs: ReadonlyMap<string, boolean>,
): ConfigListing | null => {
  if (mod.category === PERFORMANCE_CONFIG_CATEGORY) return "confirmed";
  const bundlesVpks = catalogConfigs.get(mod.remoteId);
  if (bundlesVpks !== undefined) return bundlesVpks ? "likely" : "confirmed";
  if (!HINT_CATEGORIES.has(mod.category)) return null;
  const text = [mod.name, ...(mod.tags ?? [])].join(" ");
  return HINT_PATTERN.test(text) ? "likely" : null;
};
