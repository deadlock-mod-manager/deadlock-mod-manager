import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { usePersistedStore } from "@/lib/store";

export const useScrollPosition = (key?: string) => {
  const location = useLocation();
  const scrollKey = key || location.pathname;
  const scrollElementRef = useRef<HTMLElement | null>(null);
  const isRestoringRef = useRef(false);
  const isNavigatingRef = useRef(false);

  const {
    setScrollPosition,
    getScrollPosition,
    clearScrollPosition: clearStoreScrollPosition,
  } = usePersistedStore();

  // Save current scroll position
  const saveScrollPosition = useCallback(() => {
    if (scrollElementRef.current && !isNavigatingRef.current) {
      const scrollTop = scrollElementRef.current.scrollTop;
      // Only save if scroll position is meaningful (not 0 during navigation cleanup)
      if (scrollTop > 0) {
        setScrollPosition(scrollKey, scrollTop);
      }
    }
  }, [scrollKey, setScrollPosition]);

  // Restore scroll position
  const restoreScrollPosition = useCallback(() => {
    if (scrollElementRef.current && !isRestoringRef.current) {
      const savedPosition = getScrollPosition(scrollKey);
      if (savedPosition > 0) {
        isRestoringRef.current = true;
        scrollElementRef.current.scrollTop = savedPosition;
        // Reset the flag after a short delay to allow for smooth scrolling
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 100);
      }
    }
  }, [scrollKey, getScrollPosition]);

  // Clear stored scroll position for current key
  const clearScrollPosition = useCallback(() => {
    clearStoreScrollPosition(scrollKey);
  }, [scrollKey, clearStoreScrollPosition]);

  // Set ref for the scrollable element
  const setScrollElement = useCallback(
    (element: HTMLElement | null) => {
      if (scrollElementRef.current && scrollElementRef.current !== element) {
        // Save position before changing elements
        saveScrollPosition();
      }
      scrollElementRef.current = element;
    },
    [saveScrollPosition],
  );

  // Save scroll position before navigation
  useEffect(() => {
    // Save on page visibility change (before navigation)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveScrollPosition();
      }
    };

    // Save on beforeunload
    const handleBeforeUnload = () => {
      saveScrollPosition();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Save scroll position when component unmounts or route changes
    return () => {
      // Mark as navigating to prevent cleanup overwrites
      isNavigatingRef.current = true;
      saveScrollPosition();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveScrollPosition]);

  // Save scroll position periodically while scrolling
  useEffect(() => {
    if (!scrollElementRef.current) {
      return;
    }

    const element = scrollElementRef.current;
    let timeoutId: NodeJS.Timeout;

    const handleScroll = () => {
      // Save immediately on scroll (not debounced) to ensure we don't lose position
      if (!isRestoringRef.current && scrollElementRef.current) {
        const scrollTop = scrollElementRef.current.scrollTop;
        setScrollPosition(scrollKey, scrollTop);

        // Also debounced save as backup
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (!isRestoringRef.current) {
            saveScrollPosition();
          }
        }, 150);
      }
    };

    element.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      element.removeEventListener("scroll", handleScroll);
      clearTimeout(timeoutId);
    };
  }, [saveScrollPosition, scrollKey, setScrollPosition]);

  // Get the current saved scroll position
  const getSavedScrollPosition = useCallback(() => {
    return getScrollPosition(scrollKey);
  }, [scrollKey, getScrollPosition]);

  const currentScrollY = getScrollPosition(scrollKey);

  // Reset navigation flag when component mounts (new page load)
  useEffect(() => {
    isNavigatingRef.current = false;
  }, []);

  return {
    setScrollElement,
    saveScrollPosition,
    restoreScrollPosition,
    clearScrollPosition,
    getSavedScrollPosition,
    scrollY: currentScrollY, // For direct access like TanStack Router pattern
  };
};
