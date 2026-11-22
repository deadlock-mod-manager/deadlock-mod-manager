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

export type ConfigListing = "confirmed" | "likely";

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
