import { useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

const STORAGE_KEY_PREFIX = "scroll-position:";

export const useScrollPosition = (key?: string) => {
  const location = useLocation();
  const scrollKey = key || location.pathname;
  const scrollElementRef = useRef<HTMLElement | null>(null);
  const isRestoringRef = useRef(false);
  const isNavigatingRef = useRef(false);

  const getStorageKey = useCallback(
    () => `${STORAGE_KEY_PREFIX}${scrollKey}`,
    [scrollKey],
  );

  const setScrollPosition = useCallback(
    (position: number) => {
      try {
        sessionStorage.setItem(getStorageKey(), position.toString());
      } catch (error) {
        // Silent fail if sessionStorage is not available
      }
    },
    [getStorageKey],
  );

  const getScrollPosition = useCallback((): number => {
    try {
      const saved = sessionStorage.getItem(getStorageKey());
      return saved ? Number.parseInt(saved, 10) : 0;
    } catch (error) {
      return 0;
    }
  }, [getStorageKey]);

  const clearScrollPosition = useCallback(() => {
    try {
      sessionStorage.removeItem(getStorageKey());
    } catch (error) {
      // Silent fail
    }
  }, [getStorageKey]);

  // Save current scroll position
  const saveScrollPosition = useCallback(() => {
    if (scrollElementRef.current && !isNavigatingRef.current) {
      const scrollTop = scrollElementRef.current.scrollTop;
      // Only save if scroll position is meaningful (not 0 during navigation cleanup)
      if (scrollTop > 0) {
        setScrollPosition(scrollTop);
      }
    }
  }, [setScrollPosition]);

  // Restore scroll position
  const restoreScrollPosition = useCallback(() => {
    if (scrollElementRef.current && !isRestoringRef.current) {
      const savedPosition = getScrollPosition();
      if (savedPosition > 0) {
        isRestoringRef.current = true;
        scrollElementRef.current.scrollTop = savedPosition;
        // Reset the flag after a short delay to allow for smooth scrolling
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 100);
      }
    }
  }, [getScrollPosition]);

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
        setScrollPosition(scrollTop);

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
  }, [saveScrollPosition, setScrollPosition]);

  // Get the current saved scroll position
  const getSavedScrollPosition = useCallback(() => {
    return getScrollPosition();
  }, [getScrollPosition]);

  const currentScrollY = getScrollPosition();

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
