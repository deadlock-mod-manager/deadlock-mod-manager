import type { StateCreator } from "zustand";
import type { State } from "..";

export type GameState = {
  gamePath: string;
  setGamePath: (path: string) => void;
  useCustomSteamPath: boolean;
  steamPath: string;
  setUseCustomSteamPath: (enabled: boolean) => void;
  setSteamPath: (path: string) => void;
  /** Steam build id the user has already been told about. */
  knownGameBuildId: number | null;
  setKnownGameBuildId: (buildId: number) => void;
  /** Vanilla launches strip our search paths on purpose, so they aren't a breakage. */
  lastLaunchVanilla: boolean;
  setLastLaunchVanilla: (vanilla: boolean) => void;
};

export const gameDeepMergeKeys =
  [] as const satisfies readonly (keyof GameState)[];

export const createGameSlice: StateCreator<State, [], [], GameState> = (
  set,
) => ({
  gamePath: "",
  setGamePath: (path: string) => set({ gamePath: path }),
  useCustomSteamPath: false,
  steamPath: "",
  setUseCustomSteamPath: (enabled: boolean) =>
    set(
      enabled
        ? { useCustomSteamPath: true }
        : { useCustomSteamPath: false, steamPath: "" },
    ),
  setSteamPath: (path: string) => set({ steamPath: path }),
  knownGameBuildId: null,
  setKnownGameBuildId: (buildId: number) => set({ knownGameBuildId: buildId }),
  lastLaunchVanilla: false,
  setLastLaunchVanilla: (vanilla: boolean) =>
    set({ lastLaunchVanilla: vanilla }),
});
