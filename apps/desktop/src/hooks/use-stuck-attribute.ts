import { type RefObject, useEffect } from "react";

/**
 * Sets `data-stuck` on a sticky element once it leaves its resting place,
 * without re-rendering. `anchor` is a zero-height element right above it.
 */
export const useStuckAttribute = (
  scrollRef: RefObject<HTMLElement | null>,
  anchorRef: RefObject<HTMLElement | null>,
  stickyRef: RefObject<HTMLElement | null>,
  mounted: boolean,
) => {
  useEffect(() => {
    const anchor = anchorRef.current;
    const sticky = stickyRef.current;
    if (!anchor || !sticky) return;
    const observer = new IntersectionObserver(
      ([entry]) => sticky.toggleAttribute("data-stuck", !entry.isIntersecting),
      { root: scrollRef.current },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [scrollRef, anchorRef, stickyRef, mounted]);
};
