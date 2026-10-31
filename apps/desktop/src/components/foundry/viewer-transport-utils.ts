import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";

export const EASE_OUT_QUART = "cubic-bezier(0.25, 1, 0.5, 1)";

/** Typing in the search box or picking a speed must not fire an ability. */
const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

export const isPlainKey = (event: KeyboardEvent) =>
  !event.repeat &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !isTypingTarget(event.target);

/** Where the clock sits inside the looping animation, in seconds. */
export const loopTime = (animation: PreviewAnimation | null, time: number) =>
  animation && animation.duration > 0 ? time % animation.duration : 0;

export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
