import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import type { ServerPickerLatency } from "@/types/generated/ServerPickerLatency";
import type { ServerPickerPreset } from "@/types/generated/ServerPickerPreset";
import type { ServerPickerState } from "@/types/generated/ServerPickerState";

const STATE_KEY = ["server-picker", "state"];

export const serverPickerStateQuery = queryOptions({
  queryKey: STATE_KEY,
  queryFn: () => invoke<ServerPickerState>("get_server_picker_state"),
  staleTime: 30_000,
  retry: false,
  meta: { skipGlobalErrorHandler: true },
});

export const useServerPicker = () => {
  const queryClient = useQueryClient();
  const query = useQuery(serverPickerStateQuery);
  const acceptState = (state: ServerPickerState) => {
    queryClient.setQueryData(STATE_KEY, state);
  };
  const acceptPresets = (presets: ServerPickerPreset[]) =>
    queryClient.setQueryData<ServerPickerState>(STATE_KEY, (state) =>
      state ? { ...state, presets } : state,
    );
  const refresh = useMutation({
    mutationFn: () =>
      invoke<ServerPickerState>("refresh_server_picker_catalog"),
    onSuccess: acceptState,
    meta: { skipGlobalErrorHandler: true },
  });
  const checkedCatalog = useRef(false);
  const refreshCatalog = refresh.mutate;
  const fetchedAt = query.data?.catalog?.fetchedAt;

  // Show cached locations first, then synchronize the external catalog once.
  useEffect(() => {
    if (!query.isSuccess || checkedCatalog.current) return;
    checkedCatalog.current = true;
    if (
      fetchedAt === undefined ||
      Date.now() - fetchedAt > 24 * 60 * 60 * 1000
    ) {
      refreshCatalog();
    }
  }, [query.isSuccess, fetchedAt, refreshCatalog]);
  const apply = useMutation({
    mutationFn: (blockedLocations: string[]) =>
      invoke<ServerPickerState>("apply_server_picker", { blockedLocations }),
    onSuccess: acceptState,
    onError: () => queryClient.invalidateQueries({ queryKey: STATE_KEY }),
    meta: { skipGlobalErrorHandler: true },
  });
  const restore = useMutation({
    mutationFn: () => invoke<ServerPickerState>("reset_server_picker"),
    onSuccess: acceptState,
    onError: () => queryClient.invalidateQueries({ queryKey: STATE_KEY }),
    meta: { skipGlobalErrorHandler: true },
  });
  const savePreset = useMutation({
    mutationFn: (preset: { name: string; blockedLocations: string[] }) =>
      invoke<ServerPickerPreset[]>("save_server_picker_preset", preset),
    onSuccess: acceptPresets,
    meta: { skipGlobalErrorHandler: true },
  });
  const deletePreset = useMutation({
    mutationFn: (id: string) =>
      invoke<ServerPickerPreset[]>("delete_server_picker_preset", { id }),
    onSuccess: acceptPresets,
    meta: { skipGlobalErrorHandler: true },
  });
  const cancelProbe = useMutation({
    mutationFn: () => invoke<void>("cancel_server_picker_probe"),
    meta: { skipGlobalErrorHandler: true },
  });
  const probe = useMutation({
    mutationFn: () => invoke<ServerPickerLatency[]>("probe_server_picker"),
    onSuccess: (latencies) => {
      queryClient.setQueryData<ServerPickerState>(STATE_KEY, (state) =>
        state ? { ...state, latencies } : state,
      );
    },
    meta: { skipGlobalErrorHandler: true },
  });
  const cancel = cancelProbe.mutate;
  const automaticProbeStarted = useRef(false);
  const measure = probe.mutate;
  const catalog = query.data?.catalog;
  const cachedLatencies = query.data?.latencies;

  // Defer the first native sweep until after StrictMode's setup/cleanup cycle.
  useEffect(() => {
    let scheduled: number | undefined;
    const measureWhenVisible = () => {
      if (document.hidden) {
        if (probe.isPending) automaticProbeStarted.current = false;
        return;
      }
      if (
        automaticProbeStarted.current ||
        probe.isPending ||
        refresh.isPending ||
        !catalog?.locations.length
      )
        return;
      const freshAfter = Date.now() - 60_000;
      const recent = new Set(
        cachedLatencies
          ?.filter((latency) => latency.measuredAt >= freshAfter)
          .map((latency) => latency.locationId),
      );
      if (catalog.locations.every((location) => recent.has(location.id))) {
        automaticProbeStarted.current = true;
        return;
      }
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(() => {
        if (document.hidden || automaticProbeStarted.current) return;
        automaticProbeStarted.current = true;
        measure();
      }, 0);
    };
    measureWhenVisible();
    document.addEventListener("visibilitychange", measureWhenVisible);
    return () => {
      window.clearTimeout(scheduled);
      document.removeEventListener("visibilitychange", measureWhenVisible);
    };
  }, [catalog, cachedLatencies, measure, probe.isPending, refresh.isPending]);

  // Native probes outlive their IPC promise unless explicitly cancelled.
  useEffect(() => {
    if (!probe.isPending) return;
    const cancelWhenHidden = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      cancel();
    };
  }, [cancel, probe.isPending]);

  return {
    query,
    refresh,
    apply,
    restore,
    savePreset,
    deletePreset,
    probe,
    cancelProbe,
    isWriting: apply.isPending || restore.isPending,
    clearErrors: () => {
      if (apply.isError) apply.reset();
      if (restore.isError) restore.reset();
      if (refresh.isError) refresh.reset();
      if (savePreset.isError) savePreset.reset();
      if (deletePreset.isError) deletePreset.reset();
      if (probe.isError) probe.reset();
      if (cancelProbe.isError) cancelProbe.reset();
    },
  };
};
