import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { prefetchModDetail } from "@/lib/mods/mod-detail-prefetch";

// Long enough that sweeping the pointer across the grid fetches nothing: the
// detail request is a live GameBanana call that shares its rate budget.
const HOVER_INTENT_MS = 250;

/**
 * Pointer handlers that prefetch a mod's detail once the pointer rests on its
 * card, so the detail page usually opens with fresh data already cached.
 */
export const useModDetailHoverPrefetch = (remoteId: string | undefined) => {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerEnter = useCallback(() => {
    if (!remoteId) return;
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void prefetchModDetail(queryClient, remoteId);
    }, HOVER_INTENT_MS);
  }, [cancel, queryClient, remoteId]);

  useEffect(() => cancel, [cancel]);

  return { onPointerEnter, onPointerLeave: cancel };
};
