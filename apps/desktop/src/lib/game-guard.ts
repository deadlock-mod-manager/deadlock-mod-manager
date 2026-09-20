import { invoke } from "@tauri-apps/api/core";
import { isTauriError } from "@/types/tauri";
import logger from "./logger";

/**
 * Operations that rename, move or delete files inside the game install. The
 * backend refuses them while Deadlock is running; going through here means the
 * user gets the warning dialog and can override it for a single call.
 */
export type GuardedCommand =
  | "install_mod"
  | "uninstall_mod"
  | "purge_mod"
  | "clear_mods"
  | "reorder_mods"
  | "reorder_mods_by_remote_id"
  | "batch_update_mods"
  | "swap_mod_options"
  | "switch_mod_download_variant"
  | "clear_all_mods_data"
  | "create_profile_folder"
  | "delete_profile_folder"
  | "switch_profile"
  | "delete_profile_vpk"
  | "import_profile_batch"
  | "restore_gameinfo_backup"
  | "reset_to_vanilla"
  | "create_server_addons_folder"
  | "delete_server_addons_folder"
  | "apply_server_gameinfo"
  | "restore_addons_backup"
  | "copy_selected_vpks_from_archive"
  | "copy_local_mod_vpks"
  | "replace_mod_vpks"
  | "install_mod_fonts"
  | "discard_mod_fonts"
  | "place_forge_payload"
  | "resync_profile_shards"
  | "download_deadworks_content";

export const isGameRunningError = (error: unknown): boolean =>
  isTauriError(error) && error.kind === "gameRunning";

type InvokeFn = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export type GameGuardDeps = {
  invoke: InvokeFn;
  /** Resolves true when the user picked "continue anyway". */
  confirmOverride: () => Promise<boolean>;
};

/**
 * Runs a guarded command, and on a block asks the user before retrying. The
 * retry is armed with a one-shot backend override rather than by turning the
 * guard off, so the next operation is protected again.
 */
export const runGuarded = async <T>(
  deps: GameGuardDeps,
  command: GuardedCommand,
  args?: Record<string, unknown>,
): Promise<T> => {
  try {
    return await deps.invoke<T>(command, args);
  } catch (error) {
    if (!isGameRunningError(error)) throw error;
    if (!(await deps.confirmOverride())) throw error;
    // Tied to this command, so a guarded call running alongside it cannot
    // claim a confirmation the user gave for something else.
    await deps.invoke("allow_next_game_file_operation", { operation: command });
    return await deps.invoke<T>(command, args);
  }
};

type OverridePrompt = (command: GuardedCommand) => Promise<boolean>;

let overridePrompt: OverridePrompt | null = null;

/** Registered by the renderer that owns the confirmation dialog. */
export const setGameGuardPrompt = (prompt: OverridePrompt | null): void => {
  overridePrompt = prompt;
};

export const invokeGuarded = <T>(
  command: GuardedCommand,
  args?: Record<string, unknown>,
): Promise<T> =>
  runGuarded<T>(
    {
      invoke,
      confirmOverride: async () => {
        if (!overridePrompt) {
          logger.warn("No game guard prompt registered; keeping the block");
          return false;
        }
        return await overridePrompt(command);
      },
    },
    command,
    args,
  );

/** Mirrors the user's setting into the backend, where the guard runs. */
export const applyGameGuardSetting = async (
  enabled: boolean,
): Promise<void> => {
  try {
    await invoke("set_game_file_guard", { enabled });
  } catch (error) {
    logger.withError(error).warn("Failed to sync the game guard setting");
  }
};
