import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

export type DeadworksContentStatus =
  | "checking"
  | "downloading"
  | "decompressing"
  | "ready";

export type DeadworksContentProgress = {
  status: DeadworksContentStatus;
  name: string;
  bytesDownloaded: number;
  totalBytes: number;
  itemIndex: number;
  totalItems: number;
};

export type DeadworksContentPreview = {
  totalItems: number;
  pendingItems: number;
  pendingBytes: number;
  totalBytes: number;
};

const PROGRESS_EVENT = "deadworks-content-progress";

export const contentProgressFraction = (
  progress: DeadworksContentProgress,
): number => {
  if (progress.totalItems <= 0) return 0;

  let itemFraction = 0;
  switch (progress.status) {
    case "ready":
      itemFraction = 1;
      break;
    case "checking":
    case "decompressing":
    case "downloading":
      itemFraction =
        progress.totalBytes > 0
          ? Math.min(1, progress.bytesDownloaded / progress.totalBytes)
          : 0;
      break;
    default: {
      const exhaustive: never = progress.status;
      return exhaustive;
    }
  }

  return (progress.itemIndex + itemFraction) / progress.totalItems;
};

export const useDeadworksContentProgress = (active: boolean) => {
  const [current, setCurrent] = useState<DeadworksContentProgress | null>(null);

  useEffect(() => {
    const unlisten = listen<DeadworksContentProgress>(
      PROGRESS_EVENT,
      ({ payload }) => {
        setCurrent(payload);
      },
    );
    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  useEffect(() => {
    if (!active) {
      setCurrent(null);
    }
  }, [active]);

  return {
    current,
    fraction: current ? contentProgressFraction(current) : 0,
  };
};
