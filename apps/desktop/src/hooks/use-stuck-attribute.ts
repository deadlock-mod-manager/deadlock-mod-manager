import { type RefObject, useEffect } from "react";

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
