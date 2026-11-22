import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import { ModStatus } from "../../types/mods";
import logger from "../logger";

type StateTransitionError = {
  message: string;
  currentStatus: ModStatus;
  targetStatus: ModStatus;
};

const VALID_TRANSITIONS: Record<ModStatus, ModStatus[]> = {
  [ModStatus.Downloading]: [
    ModStatus.Extracting,
    ModStatus.Downloaded,
    ModStatus.FailedToDownload,
    ModStatus.Paused,
  ],
  [ModStatus.Extracting]: [ModStatus.Downloaded, ModStatus.FailedToDownload],
  [ModStatus.Paused]: [ModStatus.Downloading, ModStatus.FailedToDownload],
  [ModStatus.Downloaded]: [
    ModStatus.Downloading,
    ModStatus.Extracting,
    ModStatus.Installing,
    ModStatus.Removing,
    ModStatus.Installed,
  ],
  [ModStatus.Installing]: [
    ModStatus.Installed,
    ModStatus.FailedToInstall,
    ModStatus.Downloaded,
  ],
  [ModStatus.Installed]: [
    ModStatus.Downloading,
    ModStatus.Extracting,
    ModStatus.Removing,
    ModStatus.Downloaded,
  ],
  [ModStatus.Removing]: [ModStatus.Removed, ModStatus.FailedToRemove],
  [ModStatus.Removed]: [ModStatus.Error],
  [ModStatus.FailedToInstall]: [ModStatus.Downloaded, ModStatus.Error],
  [ModStatus.FailedToDownload]: [ModStatus.Error, ModStatus.Downloading],
  [ModStatus.FailedToRemove]: [
    ModStatus.Installed,
    ModStatus.Downloaded,
    ModStatus.Error,
  ],
  [ModStatus.Error]: [],
};

export class ModStatusStateMachine {
  static validateTransition(
    currentStatus: ModStatus,
    targetStatus: ModStatus,
  ): Result<true, StateTransitionError> {
    if (currentStatus === targetStatus) {
      logger
        .withMetadata({ currentStatus, targetStatus })
        .debug("Status is not changing");
      return ok(true);
    }

    const allowedTransitions = VALID_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(targetStatus)) {
      logger
        .withMetadata({ currentStatus, targetStatus })
        .debug("Transition is not allowed");
      return err({
        message: `Cannot transition from ${currentStatus} to ${targetStatus}`,
        currentStatus,
        targetStatus,
      });
    }

    logger
      .withMetadata({ currentStatus, targetStatus })
      .debug("Transition is allowed");
    return ok(true);
  }

  static getValidTransitions(currentStatus: ModStatus): ModStatus[] {
    return VALID_TRANSITIONS[currentStatus];
  }
}
