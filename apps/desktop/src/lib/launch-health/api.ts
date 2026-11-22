import { invoke } from "@tauri-apps/api/core";
import type {
  ClientFingerprint,
  SessionAckOutcome,
  SessionReport,
} from "./types";

export const SESSION_STARTED_EVENT = "game-session-started";
export const SESSION_ENDED_EVENT = "game-session-ended";

export const getPendingSessionReports = () =>
  invoke<SessionReport[]>("session_pending_reports");

export const acknowledgeSession = (
  sessionId: string,
  outcome: SessionAckOutcome,
) => invoke<void>("session_acknowledge", { sessionId, outcome });

export const recordClientFingerprint = (
  sessionId: string | null,
  data: ClientFingerprint,
) => invoke<boolean>("session_record_client_fingerprint", { sessionId, data });

export const setSessionTrackingEnabled = (enabled: boolean) =>
  invoke<void>("session_set_enabled", { enabled });
