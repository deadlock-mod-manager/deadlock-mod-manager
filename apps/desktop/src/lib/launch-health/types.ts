import type { ClientModRef } from "@/types/generated/ClientModRef";
import type { PerfConfigFingerprint } from "@/types/generated/PerfConfigFingerprint";

export type { ClientFingerprint } from "@/types/generated/ClientFingerprint";
export type { ClientModRef } from "@/types/generated/ClientModRef";
export type { PerfConfigFingerprint } from "@/types/generated/PerfConfigFingerprint";
export type { SessionAckOutcome } from "@/types/generated/SessionAckOutcome";
export type { SessionFingerprint } from "@/types/generated/SessionFingerprint";
export type { SessionReport } from "@/types/generated/SessionReport";
export type { SessionStartedEvent } from "@/types/generated/SessionStartedEvent";

export type SessionChange =
  | {
      kind: "perfConfig";
      change: "turnedOn" | "switched" | "edited";
      config: PerfConfigFingerprint;
    }
  | { kind: "modsAdded"; mods: ClientModRef[] }
  | { kind: "modsUpdated"; mods: ClientModRef[] }
  | { kind: "autoexec" }
  | { kind: "launchOptions"; added: string[]; removed: string[] }
  | { kind: "addonFiles"; paths: string[] };

type CrashCheckIgnoreReason =
  | "noSignal"
  | "longSession"
  | "noBaseline"
  | "noChanges"
  | "stoppedByApp";

export type CrashCheckDecision =
  | { kind: "normal" }
  | { kind: "ignore"; reason: CrashCheckIgnoreReason }
  | {
      kind: "prompt";
      changes: SessionChange[];
      buildChanged: boolean;
      modsLoaded: boolean;
      presentation: "dialog" | "toast";
    };
