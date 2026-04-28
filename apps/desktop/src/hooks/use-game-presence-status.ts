import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import { usePersistedStore } from "@/lib/store";

interface GamePresenceStatusPayload {
  watcherActive: boolean;
  phase: string;
}

type BackendPresencePhase =
  | "inactive"
  | "waiting"
  | "connecting"
  | "connected"
  | "error";

export type DiscordPresenceUiPhase =
  | "disabled"
  | "waiting"
  | "connecting"
  | "connected"
  | "error";

function coercePhase(raw: string): BackendPresencePhase {
  switch (raw) {
    case "inactive":
      return "inactive";
    case "waiting":
      return "waiting";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "error":
      return "error";
    default:
      return "inactive";
  }
}

function deriveDiscordPresenceUi(
  presenceEnabled: boolean,
  backend: GamePresenceStatusPayload | null,
): DiscordPresenceUiPhase {
  if (!presenceEnabled) return "disabled";
  if (backend === null) return "waiting";

  const phase = coercePhase(backend.phase);
  if (!backend.watcherActive || phase === "inactive") return "waiting";

  switch (phase) {
    case "waiting":
      return "waiting";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "error":
      return "error";
    default: {
      const exhaustivePhase: never = phase;
      return exhaustivePhase;
    }
  }
}

export const useDiscordGamePresenceIndicator = (): DiscordPresenceUiPhase => {
  const gamePresenceEnabled = usePersistedStore((s) => s.gamePresenceEnabled);
  const [backend, setBackend] = useState<GamePresenceStatusPayload | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const init = (): void => {
      invoke<GamePresenceStatusPayload>("get_game_presence_status")
        .then((payload) => {
          if (!cancelled) setBackend(payload);
        })
        .catch(() => {
          if (!cancelled) setBackend(null);
        });

      listen<GamePresenceStatusPayload>("game-presence-status", (event) => {
        if (!cancelled) setBackend(event.payload);
      })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => undefined);
    };

    init();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return useMemo(
    () => deriveDiscordPresenceUi(gamePresenceEnabled, backend),
    [backend, gamePresenceEnabled],
  );
};
