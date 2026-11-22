import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import type { LocalMod } from "@/types/mods";
import { type ErrorKind, isTauriError } from "@/types/tauri";

export type BulkModAction = "disable" | "delete";

export type BulkActionRecap = {
  action: BulkModAction;
  completed: LocalMod[];
  failed: { mod: LocalMod; message: string } | null;
  notAttempted: LocalMod[];
  stoppedBy: "error" | "gameRunning" | "profileChanged" | null;
};

type RunBulkModActionOptions = {
  action: BulkModAction;
  targets: readonly LocalMod[];
  isCurrent: () => boolean;
  apply: (mod: LocalMod) => Promise<void>;
  hintFor?: (error: ErrorKind) => string | undefined;
};

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
      if (isTauriError(error) && error.kind === "gameRunning") {
        recap.notAttempted = targets.slice(index);
        recap.stoppedBy = "gameRunning";
      } else {
        logger
          .withError(error)
          .withMetadata({ action, mod: mod.remoteId })
          .error("Bulk mod action failed");
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
