import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";

export function useAddonImageCompiler(
  addonId: string,
  enabled: boolean,
  onChanged: () => void,
) {
  const client = useQueryClient();
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const [watchError, setWatchError] = useState<string | null>(null);
  const { mutateAsync: startWatch, error: startError } = useMutation({
    mutationFn: (id: string) =>
      invoke<string>("watch_modding_addon_images", { addonId: id }),
  });
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    let watchId: string | undefined;
    setWatchError(null);
    const stop = (id: string) =>
      invoke("stop_modding_addon_image_watch", { watchId: id });
    const start = async () => {
      const subscription = await listen<[string, string | null]>(
        "workbench-image-compiler-changed",
        ({ payload: [id, error] }) => {
          if (disposed || id !== addonId) return;
          setWatchError(error);
          void client.invalidateQueries({
            queryKey: ["workbench-files", addonId],
          });
          if (!error) changed.current();
        },
      );
      if (disposed) {
        subscription();
        return;
      }
      unlisten = subscription;
      const id = await startWatch(addonId);
      if (disposed) await stop(id);
      else watchId = id;
    };
    void start().catch((error) => {
      if (!disposed) setWatchError(getErrorMessage(error));
    });
    return () => {
      disposed = true;
      unlisten?.();
      if (watchId)
        void stop(watchId).catch((error) =>
          logger.withError(error).warn("Failed to stop addon image watcher"),
        );
    };
  }, [addonId, enabled, client, startWatch]);
  return watchError ?? startError;
}
