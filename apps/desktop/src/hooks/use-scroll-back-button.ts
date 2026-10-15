import { type RefObject, useEffect } from "react";
import { useScrollBackButtonContext } from "@/contexts/scroll-back-button-context";

interface UseScrollBackButtonOptions {
  /** The page's back button, replaced by the toolbar button when clipped. */
  backButtonRef: RefObject<HTMLElement | null>;
  /** Whether the hook should be active (e.g., only on specific pages) */
  enabled?: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
  /** Callback function to execute when back button is clicked */
  onBackClick?: () => void;
}

export const useScrollBackButton = ({
  backButtonRef,
  enabled = true,
  scrollContainerRef,
  onBackClick,
}: UseScrollBackButtonOptions) => {
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

    const backButton = backButtonRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!backButton || !scrollContainer) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowBackButton(entry.intersectionRatio < 1);
      },
      { root: scrollContainer, threshold: 1 },
    );
    observer.observe(backButton);

    return () => observer.disconnect();
  }, [enabled, backButtonRef, scrollContainerRef, setShowBackButton]);

  useEffect(() => {
    return () => {
      setShowBackButton(false);
      setOnBackClick(undefined);
    };
  }, [setShowBackButton, setOnBackClick]);
};
