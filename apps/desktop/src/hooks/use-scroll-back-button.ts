import { type RefObject, useEffect } from "react";
import { useScrollBackButtonContext } from "@/contexts/scroll-back-button-context";

const BACK_BUTTON_SHOW_LEAD_PX = 8;

export const shouldShowBackButton = (
  buttonBottom: number,
  containerTop: number,
): boolean => buttonBottom <= containerTop;

interface UseScrollBackButtonOptions {
  threshold?: number;
  enabled?: boolean;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  sentinelRef?: RefObject<HTMLElement | null>;
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
