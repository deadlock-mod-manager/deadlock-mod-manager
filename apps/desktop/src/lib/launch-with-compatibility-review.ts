import { isTauriError } from "@/types/tauri";

export async function launchWithCompatibilityReview(
  startGame: () => Promise<void>,
  review: () => Promise<boolean>,
  skipReview: boolean,
): Promise<boolean> {
  try {
    await startGame();
    return true;
  } catch (error) {
    if (
      skipReview ||
      !isTauriError(error) ||
      error.kind !== "modDataReviewRequired"
    ) {
      throw error;
    }
    if (!(await review())) return false;
    await startGame();
    return true;
  }
}
