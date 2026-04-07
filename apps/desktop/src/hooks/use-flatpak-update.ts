import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { updateFlatpak } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const logger = createLogger("flatpak-update");

export const useFlatpakUpdate = () => {
  const [progress, setProgress] = useState<string[]>([]);

  useEffect(() => {
    const unlisten = listen<string>("flatpak-update-progress", (event) => {
      setProgress((prev) => [...prev, event.payload]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const { mutate: installFlatpakUpdate, isPending: isInstallingFlatpakUpdate } =
    useMutation({
      mutationFn: (url: string) => updateFlatpak(url),
      onSuccess: async () => {
        logger.info("Flatpak update complete — relaunching");
        await relaunch();
      },
      onError: (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.withError(error).error("Flatpak update failed");
      },
    });

  const reset = () => setProgress([]);

  return {
    installFlatpakUpdate,
    isInstallingFlatpakUpdate,
    progress,
    reset,
  };
};
