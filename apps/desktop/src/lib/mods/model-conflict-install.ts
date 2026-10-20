import { isTauriError } from "@/types/tauri";

export type ModelConflictChoice = "replace" | "keepBoth";

export interface ModelConflictResolution {
  replace: string[];
  allow: string[];
}

const NO_RESOLUTION: ModelConflictResolution = { replace: [], allow: [] };

export async function resolveModelConflict<T>(
  install: (resolution: ModelConflictResolution) => Promise<T>,
  choose: (modIds: string[]) => Promise<ModelConflictChoice | null>,
  isCurrentProfile: () => boolean,
): Promise<T | null> {
  try {
    return await install(NO_RESOLUTION);
  } catch (error) {
    if (
      !isTauriError(error) ||
      error.kind !== "modelConflict" ||
      !error.conflictingMods?.length
    ) {
      throw error;
    }
    if (!isCurrentProfile()) return null;
    const ids = error.conflictingMods;
    const choice = await choose(ids);
    if (!choice || !isCurrentProfile()) return null;
    // The backend rescans under its mutation lock. A new conflict requires
    // another explicit choice; this approval only covers the shown mods.
    return await install(
      choice === "replace"
        ? { replace: ids, allow: [] }
        : { replace: [], allow: ids },
    );
  }
}
