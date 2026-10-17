import { type RefObject, useEffect } from "react";
import { useScrollBackButtonContext } from "@/contexts/scroll-back-button-context";

const BACK_BUTTON_SHOW_LEAD_PX = 8;

export const shouldShowBackButton = (
  buttonBottom: number,
  containerTop: number,
): boolean => buttonBottom <= containerTop;

interface UseScrollBackButtonOptions {
  /** Fallback scroll threshold when no sentinel ref is provided */
  threshold?: number;
  /** Whether the hook should be active (e.g., only on specific pages) */
  enabled?: boolean;
  /** Ref to the scroll container element. If not provided, uses window scroll */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Ref to the in-page back button used to detect when it scrolls out of view */
  sentinelRef?: RefObject<HTMLElement | null>;
  /** Callback function to execute when back button is clicked */
  onBackClick?: () => void;
}

export const useScrollBackButton = ({
  threshold = 100,
  enabled = true,
  scrollContainerRef,
  sentinelRef,
  onBackClick,
}: UseScrollBackButtonOptions = {}) => {
  const { setShowBackButton, setOnBackClick } = useScrollBackButtonContext();

  useEffect(() => {
    if (onBackClick) {
      setOnBackClick(() => onBackClick);
    }
  }, [onBackClick, setOnBackClick]);

  useEffect(() => {
    if (!enabled) {
      setShowBackButton(false);
      return;
    }

    const handleScroll = () => {
      const sentinel = sentinelRef?.current;

      if (sentinel) {
        const containerTop = scrollContainerRef?.current
          ? scrollContainerRef.current.getBoundingClientRect().top
          : 0;

        setShowBackButton(
          shouldShowBackButton(
            sentinel.getBoundingClientRect().bottom,
            containerTop + BACK_BUTTON_SHOW_LEAD_PX,
          ),
        );
        return;
      }

      const scrollY = scrollContainerRef?.current
        ? scrollContainerRef.current.scrollTop
        : window.scrollY;

      setShowBackButton(scrollY > threshold);
    };

    const scrollElement = scrollContainerRef?.current || window;

    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
    }

    return () => {
      if (scrollElement) {
        scrollElement.removeEventListener("scroll", handleScroll);
      }
    };
  }, [enabled, threshold, scrollContainerRef, sentinelRef, setShowBackButton]);

  useEffect(() => {
    return () => {
      setShowBackButton(false);
      setOnBackClick(undefined);
    };
  }, [setShowBackButton, setOnBackClick]);
};
