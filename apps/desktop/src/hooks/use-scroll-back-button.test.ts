import { describe, expect, it } from "bun:test";
import {
  shouldShowBackButton,
  shouldShowBackButtonByScroll,
} from "./use-scroll-back-button";

describe("shouldShowBackButton", () => {
  it("hides the toolbar back button while the in-page button is visible", () => {
    expect(shouldShowBackButton(64, 56)).toBe(false);
  });

  it("shows the toolbar back button as soon as the in-page button scrolls out", () => {
    expect(shouldShowBackButton(56, 56)).toBe(true);
  });

  it("keeps the toolbar back button visible after the in-page button scrolls out", () => {
    expect(shouldShowBackButton(40, 56)).toBe(true);
  });
});

describe("shouldShowBackButtonByScroll", () => {
  it("keeps the previous threshold behavior when no in-page button ref is provided", () => {
    expect(shouldShowBackButtonByScroll(50, 100)).toBe(false);
    expect(shouldShowBackButtonByScroll(100, 100)).toBe(false);
    expect(shouldShowBackButtonByScroll(101, 100)).toBe(true);
  });
});
