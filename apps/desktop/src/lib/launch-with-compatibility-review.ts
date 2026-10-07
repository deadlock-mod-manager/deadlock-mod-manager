import { isTauriError } from "@/types/tauri";

export async function launchWithCompatibilityReview(
  startGame: () => Promise<void>,
  review: () => Promise<boolean>,
  skipReview: boolean,
): Promise<void> {
  try {
    await startGame();
  } catch (error) {
    if (
      skipReview ||
      !isTauriError(error) ||
      error.kind !== "modDataReviewRequired"
    ) {
      throw error;
    }
    if (await review()) await startGame();
  }
}
