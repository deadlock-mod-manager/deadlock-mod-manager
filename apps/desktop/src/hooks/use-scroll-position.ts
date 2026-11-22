import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { usePersistedStore } from "@/lib/store";

export const useScrollPosition = (key?: string) => {
  const location = useLocation();
  const scrollKey = key || location.pathname;
  const scrollElementRef = useRef<HTMLElement | null>(null);
  const isRestoringRef = useRef(false);
  const isNavigatingRef = useRef(false);
  const [scrollElementVersion, setScrollElementVersion] = useState(0);

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

  const saveScrollPosition = useCallback(() => {
    if (!isNavigatingRef.current) {
      setScrollPosition(scrollKey, scrollTopRef.current);
    }
  }, [scrollKey, setScrollPosition]);

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

  const clearScrollPosition = useCallback(() => {
    clearStoreScrollPosition(scrollKey);
  }, [scrollKey, clearStoreScrollPosition]);

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

  const initialScrollY = useRef(getScrollPosition(scrollKey));

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
