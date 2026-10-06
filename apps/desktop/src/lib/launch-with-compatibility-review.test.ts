import { describe, expect, it, mock } from "bun:test";
import { launchWithCompatibilityReview } from "./launch-with-compatibility-review";

const reviewRequired = {
  kind: "modDataReviewRequired",
  message: "Selected compatibility fixes need review",
};

describe("launchWithCompatibilityReview", () => {
  it("opens required review and resumes launch only after repairs are applied", async () => {
    const calls: string[] = [];
    const startGame = mock(async () => {
      calls.push("start");
      if (calls.length === 1) throw reviewRequired;
    });
    const review = mock(async () => {
      calls.push("review-applied");
      return true;
    });

    await launchWithCompatibilityReview(startGame, review, false);

    expect(calls).toEqual(["start", "review-applied", "start"]);
  });

  it("leaves the game closed when review is dismissed", async () => {
    const startGame = mock(async () => {
      throw reviewRequired;
    });
    const review = mock(async () => false);

    await launchWithCompatibilityReview(startGame, review, false);

    expect(review).toHaveBeenCalledTimes(1);
    expect(startGame).toHaveBeenCalledTimes(1);
  });

  it("waits for the review result before attempting to start the game again", async () => {
    const startGame = mock(async () => {
      if (startGame.mock.calls.length === 1) throw reviewRequired;
    });
    const approval = Promise.withResolvers<boolean>();
    const review = mock(() => approval.promise);
    const launch = launchWithCompatibilityReview(startGame, review, false);
    await Promise.resolve();

    expect(review).toHaveBeenCalledTimes(1);
    expect(startGame).toHaveBeenCalledTimes(1);
    approval.resolve(true);
    await launch;
    expect(startGame).toHaveBeenCalledTimes(2);
  });

  it("does not launch when applying the review fails", async () => {
    const failure = new Error("Mods changed since compatibility review");
    const startGame = mock(async () => {
      throw reviewRequired;
    });
    const review = mock(async () => {
      throw failure;
    });

    await expect(
      launchWithCompatibilityReview(startGame, review, false),
    ).rejects.toThrow(failure);
    expect(startGame).toHaveBeenCalledTimes(1);
  });

  it("does not open review for a verified repair or an opted-out profile", async () => {
    const startGame = mock(async () => {});
    const review = mock(async () => true);

    await launchWithCompatibilityReview(startGame, review, false);

    expect(startGame).toHaveBeenCalledTimes(1);
    expect(review).not.toHaveBeenCalled();
  });

  it("keeps vanilla launches out of the mod review flow", async () => {
    const startGame = mock(async () => {
      throw reviewRequired;
    });
    const review = mock(async () => true);

    await expect(
      launchWithCompatibilityReview(startGame, review, true),
    ).rejects.toEqual(reviewRequired);
    expect(review).not.toHaveBeenCalled();
  });

  it("does not retry unrelated launch failures", async () => {
    const failure = { kind: "gameLaunchFailed", message: "Steam unavailable" };
    const startGame = mock(async () => {
      throw failure;
    });
    const review = mock(async () => true);

    await expect(
      launchWithCompatibilityReview(startGame, review, false),
    ).rejects.toEqual(failure);
    expect(review).not.toHaveBeenCalled();
    expect(startGame).toHaveBeenCalledTimes(1);
  });

  it("does not repeatedly prompt if inputs change again after review", async () => {
    const startGame = mock(async () => {
      throw reviewRequired;
    });
    const review = mock(async () => true);

    await expect(
      launchWithCompatibilityReview(startGame, review, false),
    ).rejects.toEqual(reviewRequired);
    expect(review).toHaveBeenCalledTimes(1);
    expect(startGame).toHaveBeenCalledTimes(2);
  });
});
