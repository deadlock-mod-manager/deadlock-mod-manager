import type { Result } from 'neverthrow';
import { err, ok } from 'neverthrow';
import { ModStatus } from '../../types/mods';
import logger from '../logger';

type StateTransitionError = {
  message: string;
  currentStatus: ModStatus;
  targetStatus: ModStatus;
};

/**
 * Defines the valid transitions between document statuses
 *
 * NOTE: this is an example, it might not be necessary after all.
 */
const VALID_TRANSITIONS: Record<ModStatus, ModStatus[]> = {
  [ModStatus.Downloading]: [ModStatus.Downloaded, ModStatus.FailedToDownload],
  [ModStatus.Downloaded]: [ModStatus.Installing, ModStatus.Removing],
  [ModStatus.Installing]: [ModStatus.Installed, ModStatus.Downloaded, ModStatus.FailedToInstall],
  [ModStatus.Installed]: [ModStatus.Removing, ModStatus.Downloaded],
  [ModStatus.Removing]: [ModStatus.Removed, ModStatus.FailedToRemove],
  [ModStatus.Removed]: [ModStatus.Error],
  [ModStatus.FailedToInstall]: [ModStatus.Downloaded, ModStatus.Error],
  [ModStatus.FailedToDownload]: [ModStatus.Error],
  [ModStatus.FailedToRemove]: [
    ModStatus.Installed,
    ModStatus.Downloaded,
    ModStatus.Error,
  ],
  [ModStatus.Error]: [],
};

/**
 * Document Status State Machine - manages valid transitions between document statuses
 */
export class ModStatusStateMachine {
  /**
   * Validates if a transition from the current status to the target status is allowed
   *
   * @param currentStatus - The current status of the document
   * @param targetStatus - The desired target status
   * @returns Result containing success or error with details
   */
  static validateTransition(
    currentStatus: ModStatus,
    targetStatus: ModStatus
  ): Result<true, StateTransitionError> {
    // If status is not changing, it's always valid
    if (currentStatus === targetStatus) {
      logger.debug('Status is not changing', { currentStatus, targetStatus });
      return ok(true);
    }

    // Check if the transition is allowed based on defined valid transitions
    const allowedTransitions = VALID_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(targetStatus)) {
      logger.debug('Transition is not allowed', {
        currentStatus,
        targetStatus,
      });
      return err({
        message: `Cannot transition from ${currentStatus} to ${targetStatus}`,
        currentStatus,
        targetStatus,
      });
    }

    logger.debug('Transition is allowed', { currentStatus, targetStatus });
    return ok(true);
  }

  /**
   * Get all valid target statuses for a given current status
   *
   * @param currentStatus - The current status of the document
   * @returns Array of valid target statuses
   */
  static getValidTransitions(currentStatus: ModStatus): ModStatus[] {
    return VALID_TRANSITIONS[currentStatus];
  }
}
