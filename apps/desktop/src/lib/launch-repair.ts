import type { ReinstallResult } from "@/hooks/use-reinstall-mod";
import { getErrorMessage } from "@/lib/errors";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import type { LocalMod } from "@/types/mods";

export type LaunchRepairMod = {
  id: string;
  name: string;
  local: boolean;
  mod?: LocalMod;
};

export type LaunchRepairFailure = { id: string; error?: string };
export type LaunchRepairProgress = {
  index: number;
  total: number;
  name: string;
};

export function resolveLaunchRepairMods(
  affected: { id: string; name: string }[],
  library: LocalMod[],
): LaunchRepairMod[] {
  return affected.map((entry) => {
    const mod = library.find((item) => item.remoteId === entry.id);
    return {
      ...entry,
      name: mod?.name ?? entry.name,
      local:
        isLocalMod({ remoteId: entry.id }) ||
        (mod?.downloadable === false &&
          !mod.downloads?.length &&
          !mod.selectedDownloads?.length),
      mod,
    };
  });
}

export async function repairLaunchFiles(
  targets: LaunchRepairMod[],
  action: "reinstall" | "disable",
  operations: {
    reinstall: (mod: LocalMod) => Promise<ReinstallResult>;
    disable: (target: LaunchRepairMod) => Promise<void>;
    launch: () => Promise<void>;
    onProgress: (progress: LaunchRepairProgress) => void;
  },
): Promise<LaunchRepairFailure[]> {
  const failures: LaunchRepairFailure[] = [];
  const reinstallable = targets.filter((target) => !target.local);
  let index = 0;
  for (const target of targets) {
    try {
      if (action === "disable" || target.local) {
        await operations.disable(target);
      } else if (target.mod) {
        operations.onProgress({
          index: ++index,
          total: reinstallable.length,
          name: target.name,
        });
        const result = await operations.reinstall(target.mod);
        if (result.outcome !== "restored") {
          failures.push({ id: target.id, error: result.error });
        }
      } else {
        failures.push({ id: target.id });
      }
    } catch (error) {
      failures.push({ id: target.id, error: getErrorMessage(error) });
    }
  }
  if (failures.length === 0) await operations.launch();
  return failures;
}
