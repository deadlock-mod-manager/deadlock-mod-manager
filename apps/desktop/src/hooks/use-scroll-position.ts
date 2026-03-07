import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { usePersistedStore } from "@/lib/store";

export const useScrollPosition = (key?: string) => {
  const location = useLocation();
  const scrollKey = key || location.pathname;
  const scrollElementRef = useRef<HTMLElement | null>(null);
  const isRestoringRef = useRef(false);
  const isNavigatingRef = useRef(false);
  // Bumped in setScrollElement so the scroll-listener effect re-runs when the element changes.
  const [scrollElementVersion, setScrollElementVersion] = useState(0);

  // Stored in a ref to avoid Zustand store writes (and re-renders) on every scroll event.
  const scrollTopRef = useRef(0);

  const setScrollPosition = usePersistedStore(
    (state) => state.setScrollPosition,
  );
  const getScrollPosition = usePersistedStore(
    (state) => state.getScrollPosition,
  );
  const clearStoreScrollPosition = usePersistedStore(
    (state) => state.clearScrollPosition,
  );

  // Persist the current ref-tracked scroll position into the store.
  // Only called on unmount, navigation, or visibility change — never mid-scroll.
  const saveScrollPosition = useCallback(() => {
    if (!isNavigatingRef.current) {
      setScrollPosition(scrollKey, scrollTopRef.current);
    }
  }, [scrollKey, setScrollPosition]);

  // Restore scroll position
  const restoreScrollPosition = useCallback(() => {
    if (scrollElementRef.current && !isRestoringRef.current) {
      const savedPosition = getScrollPosition(scrollKey);
      if (savedPosition > 0) {
        isRestoringRef.current = true;
        scrollElementRef.current.scrollTop = savedPosition;
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
        saveScrollPosition();
      }
      scrollElementRef.current = element;
      setScrollElementVersion((v) => v + 1);
    },
    [saveScrollPosition],
  );

  // Persist scroll position on visibility change, beforeunload, and unmount
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveScrollPosition();
      }
    };

    const handleBeforeUnload = () => {
      saveScrollPosition();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      saveScrollPosition();
      isNavigatingRef.current = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveScrollPosition]);

  // Attaches the scroll listener; re-runs via scrollElementVersion when the element changes.
  useEffect(() => {
    const element = scrollElementRef.current;
    if (!element) {
      return;
    }

    const handleScroll = () => {
      if (!isRestoringRef.current && scrollElementRef.current) {
        scrollTopRef.current = scrollElementRef.current.scrollTop;
      }
    };

    element.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, [scrollElementVersion]);

  // Read the initial scroll position from the store once on mount
  const initialScrollY = useRef(getScrollPosition(scrollKey));

  // Reset navigation flag when component mounts (new page load)
  useEffect(() => {
    isNavigatingRef.current = false;
  }, []);

  return {
    setScrollElement,
    saveScrollPosition,
    restoreScrollPosition,
    clearScrollPosition,
    scrollY: initialScrollY.current,
  };
};
