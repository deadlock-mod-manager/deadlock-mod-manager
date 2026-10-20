import { isTauriError } from "@/types/tauri";

export async function resolveModelConflict<T>(
  install: (replaceConflictingMods: string[]) => Promise<T>,
  confirm: (modIds: string[]) => Promise<boolean>,
  isCurrentProfile: () => boolean,
): Promise<T | null> {
  try {
    return await install([]);
  } catch (error) {
    if (
      !isTauriError(error) ||
      error.kind !== "modelConflict" ||
      !error.conflictingMods?.length
    ) {
      throw error;
    }
    if (!isCurrentProfile()) return null;
    if (!(await confirm(error.conflictingMods)) || !isCurrentProfile()) {
      return null;
    }
    // The backend rescans under its mutation lock. A new conflict requires
    // another explicit choice; this approval cannot disable arbitrary mods.
    return await install(error.conflictingMods);
  }
}
