import type { ModDependency } from "@/types/dependencies";
import { requirementState } from "@/lib/mods/requirements";
import { usePersistedStore } from "@/lib/store";

export function useRequirementState(dependency: ModDependency) {
  return usePersistedStore((state) =>
    requirementState(dependency, state.localMods),
  );
}
