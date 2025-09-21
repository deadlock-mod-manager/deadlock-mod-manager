import { type RefObject, useEffect } from "react";
import { useScrollBackButtonContext } from "@/contexts/scroll-back-button-context";

interface UseScrollBackButtonOptions {
  /** Scroll threshold in pixels before showing the back button */
  threshold?: number;
  /** Whether the hook should be active (e.g., only on specific pages) */
  enabled?: boolean;
  /** Ref to the scroll container element. If not provided, uses window scroll */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Callback function to execute when back button is clicked */
  onBackClick?: () => void;
}

export const useScrollBackButton = ({
  threshold = 100,
  enabled = true,
  scrollContainerRef,
  onBackClick,
}: UseScrollBackButtonOptions = {}) => {
  const { setShowBackButton, setOnBackClick } = useScrollBackButtonContext();

  useEffect(() => {
    if (!enabled) {
      setShowBackButton(false);
      return;
    }

    const handleScroll = () => {
      let scrollY: number;

      if (scrollContainerRef?.current) {
        scrollY = scrollContainerRef.current.scrollTop;
      } else {
        scrollY = window.scrollY;
      }

      setShowBackButton(scrollY > threshold);
    };

    const scrollElement = scrollContainerRef?.current || window;

    if (!scrollElement) {
      return;
    }

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });

    handleScroll();

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [threshold, enabled, scrollContainerRef, setShowBackButton]);

  useEffect(() => {
    if (onBackClick) {
      setOnBackClick(() => onBackClick);
    }
  }, [onBackClick, setOnBackClick]);

  useEffect(() => {
    return () => {
      setShowBackButton(false);
      setOnBackClick(undefined);
    };
  }, [setShowBackButton, setOnBackClick]);
};
