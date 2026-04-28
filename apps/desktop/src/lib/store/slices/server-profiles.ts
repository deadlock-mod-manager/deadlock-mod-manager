import { invoke } from "@tauri-apps/api/core";
import type { StateCreator } from "zustand";
import logger from "@/lib/logger";
import type { State } from "..";

export const MAX_STAGED_SERVERS = 5;

export type StagedServer = {
  serverId: string;
  folderName: string;
  requiredModIds: string[];
  lastUsed: string;
  layered: boolean;
};

export type LastServerJoin = {
  serverId: string;
  folderName: string;
};

export type ServerProfilesState = {
  stagedServers: Record<string, StagedServer>;
  lastServerJoin: LastServerJoin | null;

  recordStagedServer: (entry: StagedServer) => void;
  recordJoin: (entry: LastServerJoin) => void;
  clearLastJoin: () => void;
  forgetServer: (serverId: string) => Promise<void>;
  evictStagedServersIfNeeded: () => Promise<void>;
  getStagedServer: (serverId: string) => StagedServer | undefined;
};

export const serverProfilesDeepMergeKeys =
  [] as const satisfies readonly (keyof ServerProfilesState)[];

export const createServerProfilesSlice: StateCreator<
  State,
  [],
  [],
  ServerProfilesState
> = (set, get) => ({
  stagedServers: {},
  lastServerJoin: null,

  recordStagedServer: (entry) => {
    set((state) => ({
      stagedServers: {
        ...state.stagedServers,
        [entry.serverId]: entry,
      },
    }));
  },

  recordJoin: (entry) => {
    set({ lastServerJoin: entry });
  },

  clearLastJoin: () => {
    set({ lastServerJoin: null });
  },

  forgetServer: async (serverId) => {
    const entry = get().stagedServers[serverId];
    if (!entry) return;

    try {
      await invoke("delete_server_addons_folder", { serverId });
    } catch (error) {
      logger
        .withMetadata({ serverId, folderName: entry.folderName })
        .withError(error)
        .warn("Failed to delete staged server folder on disk");
    }

    set((state) => {
      const next = { ...state.stagedServers };
      delete next[serverId];
      const lastServerJoin =
        state.lastServerJoin?.serverId === serverId
          ? null
          : state.lastServerJoin;
      return { stagedServers: next, lastServerJoin };
    });
  },

  evictStagedServersIfNeeded: async () => {
    const { stagedServers, lastServerJoin, forgetServer } = get();
    const entries = Object.values(stagedServers);
    if (entries.length <= MAX_STAGED_SERVERS) return;

    const sorted = [...entries].sort(
      (a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime(),
    );

    // Walk oldest-first and skip the last-joined entry; pre-slicing would
    // leave the cache stuck above the cap when it happens to be the oldest.
    let toEvict = entries.length - MAX_STAGED_SERVERS;
    for (const entry of sorted) {
      if (toEvict <= 0) break;
      if (entry.serverId === lastServerJoin?.serverId) continue;
      await forgetServer(entry.serverId);
      toEvict--;
    }
  },

  getStagedServer: (serverId) => get().stagedServers[serverId],
});
