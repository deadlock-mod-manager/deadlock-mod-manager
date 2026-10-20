import { toast } from "@deadlock-mods/ui/components/sonner";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import useInstallWithCollection from "@/hooks/use-install-with-collection";
import { analytics } from "@/lib/analytics";
import {
  type BisectOutcome,
  createBisect,
  nextStep,
  recordOutcome,
} from "@/lib/bisect/search";
import { loadOrderOf, sortByLoadOrder } from "@/lib/bisect/load-order";
import { invokeGuarded, isGameRunningError } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { type State, usePersistedStore } from "@/lib/store";
import {
  BISECT_SESSION_VERSION,
  type BisectSession,
  isCurrentBisectSession,
} from "@/lib/store/slices/bisect";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";
import { type LocalMod, ModStatus } from "@/types/mods";

const isEnabled = (state: State, mod: LocalMod) =>
  mod.status === ModStatus.Installed &&
  state.isModEnabledInCurrentProfile(mod.remoteId);

export const getEnabledMods = (state: State) =>
  state.localMods.filter((mod) => isEnabled(state, mod));

/**
 * Map mods are turned off by every launch, and critical-path mods ask for a
 * confirmation each time they are enabled, so neither can be toggled freely.
 */
export const isBisectCandidate = (mod: LocalMod) =>
  !mod.isMap && !mod.usesCriticalPaths;

const BISECT_MUTATION_KEY = ["bisect"];

class ModSwitchError extends Error {
  constructor(readonly modName: string) {
    super(`Could not enable ${modName}`);
  }
}

class GameRunningError extends Error {
  constructor() {
    super("Deadlock started while mods were being switched");
  }
}

/**
 * Re-enabled mods take the next free pak slots, so without this the order on
 * disk drifts every round, and with it which mod wins a conflict.
 */
const restoreLoadOrder = async (loadOrder: string[]) => {
  const state = usePersistedStore.getState();
  const profileFolder = state.getActiveProfile()?.folderName ?? null;
  const { manifest } = await getProfileVpkSnapshot(profileFolder);
  const current = loadOrderOf(manifest);
  const wanted = sortByLoadOrder(current, loadOrder);
  if (wanted.every((id, index) => id === current[index])) return;

  const vpksById = new Map(
    state.localMods.map((mod) => [mod.remoteId, mod.installedVpks ?? []]),
  );
  const mappings = await invokeGuarded<Array<[string, string[]]>>(
    "reorder_mods_by_remote_id",
    {
      modOrderData: wanted.map((id, index) => [
        id,
        vpksById.get(id) ?? [],
        index,
      ]),
      profileFolder,
    },
  );
  state.reorderMods(wanted);
  state.updateModVpksAfterReorder(mappings);
};

/**
 * Turns the `scope` mods in `target` on and the rest of them off, then puts
 * every enabled mod back in its original load order.
 */
const useApplyModSet = () => {
  const { install } = useInstallWithCollection();

  return async (
    scope: string[],
    target: Set<string>,
    loadOrder: string[],
    originalEnabled: string[],
  ) => {
    const state = usePersistedStore.getState();
    const profileFolder = state.getActiveProfile()?.folderName ?? null;
    const inScope = new Set(scope);
    const mods = state.localMods.filter((mod) => inScope.has(mod.remoteId));
    const turnOff = mods.filter(
      (mod) => isEnabled(state, mod) && !target.has(mod.remoteId),
    );
    const turnOn = mods.filter(
      (mod) => !isEnabled(state, mod) && target.has(mod.remoteId),
    );

    for (const mod of turnOff) {
      await invokeGuarded("uninstall_mod", {
        modId: mod.remoteId,
        vpks: mod.installedVpks ?? [],
        profileFolder,
      });
      state.setModStatus(mod.remoteId, ModStatus.Downloaded);
      state.setModEnabledInCurrentProfile(mod.remoteId, false);
    }

    for (const { remoteId } of turnOn) {
      const mod = usePersistedStore
        .getState()
        .localMods.find((item) => item.remoteId === remoteId);
      if (!mod) continue;
      let enabled = false;
      let gameRunning = false;
      await install(mod, {
        analyticsEntryPoint: "library",
        analyticsOperationKind: "enable",
        skipFileSelection: true,
        bisectOriginalEnabled: originalEnabled,
        onStart: (m) => state.setModStatus(m.remoteId, ModStatus.Installing),
        onComplete: (m, installed) => {
          state.setModStatus(m.remoteId, ModStatus.Installed);
          state.setInstalledVpks(
            m.remoteId,
            installed.installed_vpks,
            installed.file_tree,
          );
          state.setModEnabledInCurrentProfile(m.remoteId, true);
          enabled = true;
        },
        onError: (m, error) => {
          state.setModStatus(m.remoteId, ModStatus.Downloaded);
          gameRunning = error.kind === "gameRunning";
        },
        onCancel: (m) => state.setModStatus(m.remoteId, ModStatus.Downloaded),
      });
      if (gameRunning) throw new GameRunningError();
      if (!enabled) throw new ModSwitchError(mod.name);
    }

    await restoreLoadOrder(loadOrder);
  };
};

class OutdatedSessionError extends Error {
  constructor() {
    super("The bisect session was saved by an older version");
  }
}

class ProfileMismatchError extends Error {
  constructor() {
    super("The bisect session belongs to another profile");
  }
}

/** True when a candidate was toggled by hand since the round was set up. */
const roundDrifted = (state: State, session: BisectSession) => {
  const candidates = new Set(session.candidates);
  const on = new Set(session.config);
  return state.localMods.some(
    (mod) =>
      candidates.has(mod.remoteId) &&
      isEnabled(state, mod) !== on.has(mod.remoteId),
  );
};

const update = (patch: Partial<BisectSession>) =>
  usePersistedStore.getState().updateBisectSession(patch);

type BisectAction =
  | { type: "start"; candidates: string[] }
  | { type: "answer"; outcome: BisectOutcome }
  | { type: "undo" }
  | { type: "retry" }
  | { type: "finish"; disableCulprits: boolean }
  | { type: "stop" }
  | { type: "discard" };

export const useBisect = () => {
  const { t } = useTranslation();
  const applyModSet = useApplyModSet();
  const pending = useIsMutating({ mutationKey: BISECT_MUTATION_KEY }) > 0;

  const applyRound = async (session: BisectSession) => {
    update({ stage: "applying", crashDetected: false });
    await applyModSet(
      session.candidates,
      new Set(session.config),
      session.loadOrder,
      session.originalEnabled,
    );
    update({ stage: "ready" });
  };

  const restore = async (session: BisectSession) => {
    update({ stage: "restoring" });
    const keepOff = new Set(session.disableOnFinish);
    await applyModSet(
      session.candidates,
      new Set(session.originalEnabled.filter((id) => !keepOff.has(id))),
      session.loadOrder,
      session.originalEnabled,
    );
    usePersistedStore.getState().setBisectSession(null);
  };

  const start = async (state: State, candidates: string[]) => {
    const step = nextStep(createBisect(candidates));
    if (step.kind !== "test") return;
    const { manifest } = await getProfileVpkSnapshot(
      state.getActiveProfile()?.folderName ?? null,
    );
    const session: BisectSession = {
      version: BISECT_SESSION_VERSION,
      profileId: state.activeProfileId,
      startedAt: new Date().toISOString(),
      originalEnabled: getEnabledMods(state).map((mod) => mod.remoteId),
      loadOrder: loadOrderOf(manifest),
      candidates,
      algo: step.state,
      config: step.config,
      round: 1,
      stage: "applying",
      crashDetected: false,
      culprits: null,
      disableOnFinish: [],
      history: [],
    };
    // Saved before any mod changes, so a crash mid-way can still restore.
    state.setBisectSession(session);
    analytics.track("bisect_started", { mod_count: candidates.length });
    await applyRound(session);
  };

  const answer = async (
    state: State,
    session: BisectSession,
    outcome: BisectOutcome,
  ) => {
    if (roundDrifted(state, session)) {
      toast.warning(t("bisect.toasts.roundChanged"));
      await applyRound(session);
      return;
    }
    const history = [
      ...session.history,
      { algo: session.algo, config: session.config, round: session.round },
    ];
    const step = nextStep(recordOutcome(session.algo, session.config, outcome));
    if (step.kind === "done") {
      update({
        algo: step.state,
        culprits: step.culprits,
        history,
        stage: "result",
      });
      analytics.track("bisect_finished", {
        rounds: session.round,
        culprit_count: step.culprits.length,
      });
      return;
    }
    const next: BisectSession = {
      ...session,
      algo: step.state,
      config: step.config,
      round: session.round + 1,
      history,
    };
    update(next);
    await applyRound(next);
  };

  const undo = async (session: BisectSession) => {
    const previous = session.history.at(-1);
    if (!previous) return;
    const next: BisectSession = {
      ...session,
      ...previous,
      culprits: null,
      history: session.history.slice(0, -1),
    };
    update(next);
    await applyRound(next);
  };

  const finish = async (session: BisectSession, disableCulprits: boolean) => {
    const next: BisectSession = {
      ...session,
      disableOnFinish: disableCulprits ? (session.culprits ?? []) : [],
    };
    update(next);
    await restore(next);
    toast.success(
      next.disableOnFinish.length > 0
        ? t("bisect.toasts.restoredWithout", {
            count: next.disableOnFinish.length,
          })
        : t("bisect.toasts.restored"),
    );
  };

  const mutation = useMutation({
    mutationKey: BISECT_MUTATION_KEY,
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (action: BisectAction) => {
      const state = usePersistedStore.getState();
      if (action.type === "start") {
        await start(state, action.candidates);
        return;
      }

      const session = state.bisectSession;
      if (!session) return;
      if (action.type === "discard") {
        state.setBisectSession(null);
        return;
      }
      // Toggling here would change another profile's mods.
      if (session.profileId !== state.activeProfileId) {
        throw new ProfileMismatchError();
      }
      if (action.type !== "stop" && !isCurrentBisectSession(session)) {
        throw new OutdatedSessionError();
      }

      switch (action.type) {
        case "answer":
          await answer(state, session, action.outcome);
          return;
        case "undo":
          await undo(session);
          return;
        case "retry":
          if (session.stage === "restoring") await restore(session);
          else await applyRound(session);
          return;
        case "finish":
          await finish(session, action.disableCulprits);
          return;
        case "stop":
          analytics.track("bisect_stopped", { rounds: session.round });
          await restore({ ...session, disableOnFinish: [] });
          toast.success(t("bisect.toasts.restored"));
          return;
      }
    },
    onError: (error) => {
      if (error instanceof GameRunningError || isGameRunningError(error)) {
        toast.error(t("bisect.toasts.gameRunning"));
        return;
      }
      if (error instanceof OutdatedSessionError) {
        toast.error(t("bisect.recovery.outdated"));
        return;
      }
      if (error instanceof ProfileMismatchError) {
        toast.error(t("bisect.toasts.wrongProfile"));
        return;
      }
      logger.withError(error).error("Mod bisect step failed");
      toast.error(
        error instanceof ModSwitchError
          ? t("bisect.toasts.switchFailed", { name: error.modName })
          : t("bisect.toasts.stepFailed"),
      );
    },
  });

  return {
    run: mutation.mutate,
    // Shared by every component that drives the session.
    isPending: pending,
  };
};
