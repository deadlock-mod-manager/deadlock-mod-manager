import { isTauriError } from "@/types/tauri";

export async function launchWithCompatibilityReview(
  startGame: () => Promise<boolean | void>,
  review: () => Promise<boolean>,
  skipReview: boolean,
): Promise<boolean> {
  try {
    return (await startGame()) !== false;
  } catch (error) {
    if (
      skipReview ||
      !isTauriError(error) ||
      error.kind !== "modDataReviewRequired"
    ) {
      throw error;
    }
    if (!(await review())) return false;
    return (await startGame()) !== false;
  }
}
