import type { ClientModRef } from "@/types/generated/ClientModRef";
import type { PerfConfigFingerprint } from "@/types/generated/PerfConfigFingerprint";

export type { ClientFingerprint } from "@/types/generated/ClientFingerprint";
export type { ClientModRef } from "@/types/generated/ClientModRef";
export type { PerfConfigFingerprint } from "@/types/generated/PerfConfigFingerprint";
export type { SessionAckOutcome } from "@/types/generated/SessionAckOutcome";
export type { SessionFingerprint } from "@/types/generated/SessionFingerprint";
export type { SessionReport } from "@/types/generated/SessionReport";
export type { SessionStartedEvent } from "@/types/generated/SessionStartedEvent";

/** One thing that differs between the last normal session and this one. */
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
  /** VPKs changed in a way the mod list doesn't explain. */
  | { kind: "addonFiles"; paths: string[] };

type CrashCheckIgnoreReason =
  | "noSignal"
  | "longSession"
  | "noBaseline"
  | "noChanges"
  | "stoppedByApp";

export type CrashCheckDecision =
  /** The session ran normally: it becomes the new baseline. */
  | { kind: "normal" }
  | { kind: "ignore"; reason: CrashCheckIgnoreReason }
  | {
      kind: "prompt";
      changes: SessionChange[];
      /** Deadlock's build differs from the last normal session. */
      buildChanged: boolean;
      /** No addon search path had a VPK, so mods weren't mounted at all. */
      modsLoaded: boolean;
      /** A dialog for strong evidence, a toast for weaker or older evidence. */
      presentation: "dialog" | "toast";
    };
