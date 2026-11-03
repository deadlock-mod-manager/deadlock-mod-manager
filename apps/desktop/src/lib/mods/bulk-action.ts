import { getErrorMessage } from "@/lib/errors";
import type { LocalMod } from "@/types/mods";
import { type ErrorKind, isTauriError } from "@/types/tauri";

type BulkModAction = "disable" | "delete";

/** What a bulk disable or delete did before it finished or stopped. */
export type BulkActionRecap = {
  action: BulkModAction;
  completed: LocalMod[];
  /** The mod whose operation threw. A run stops there, so there is at most one. */
  failed: { mod: LocalMod; message: string } | null;
  notAttempted: LocalMod[];
  /** Null when every target completed. */
  stoppedBy: "error" | "gameRunning" | "profileChanged" | null;
};

type RunBulkModActionOptions = {
  action: BulkModAction;
  targets: readonly LocalMod[];
  /** False once the active profile is no longer the one the run started in. */
  isCurrent: () => boolean;
  apply: (mod: LocalMod) => Promise<void>;
  /** Extra guidance appended to a backend error's message, if any applies. */
  hintFor?: (error: ErrorKind) => string | undefined;
};

/**
 * Applies `apply` to each target in order and stops at the first failure,
 * recording what was done, what failed and what was never attempted.
 */
export const runBulkModAction = async ({
  action,
  targets,
  isCurrent,
  apply,
  hintFor,
}: RunBulkModActionOptions): Promise<BulkActionRecap> => {
  const recap: BulkActionRecap = {
    action,
    completed: [],
    failed: null,
    notAttempted: [],
    stoppedBy: null,
  };
  for (const [index, mod] of targets.entries()) {
    if (!isCurrent()) {
      recap.notAttempted = targets.slice(index);
      recap.stoppedBy = "profileChanged";
      break;
    }
    try {
      await apply(mod);
    } catch (error) {
      // The user kept the game-running block, so this mod was skipped on
      // purpose rather than failing; every later one would be blocked too.
      if (isTauriError(error) && error.kind === "gameRunning") {
        recap.notAttempted = targets.slice(index);
        recap.stoppedBy = "gameRunning";
      } else {
        const hint = isTauriError(error) ? hintFor?.(error) : undefined;
        const message = getErrorMessage(error);
        recap.failed = { mod, message: hint ? `${message} ${hint}` : message };
        recap.notAttempted = targets.slice(index + 1);
        recap.stoppedBy = "error";
      }
      break;
    }
    recap.completed.push(mod);
  }
  return recap;
};
