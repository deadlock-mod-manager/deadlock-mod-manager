import type { ModDto } from "@deadlock-mods/shared";

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;
export type AnalyticsOutcome =
  | "completed"
  | "cancelled"
  | "blocked"
  | "failed"
  | "partial";
export type ModEntryPoint =
  | "catalog"
  | "search"
  | "featured"
  | "author"
  | "album"
  | "mod_details"
  | "library"
  | "skins"
  | "deep_link"
  | "reinstall"
  | "retry"
  | "other";
export type ContentType = "map" | "sound" | "mod";
export const modContentType = (
  mod: Pick<ModDto, "isMap" | "isAudio">,
): ContentType => (mod.isMap ? "map" : mod.isAudio ? "sound" : "mod");

type ModAction = {
  mod_id: string;
  entry_point: ModEntryPoint;
  content_type: ContentType;
};
type NoProperties = Record<string, never>;
type UpdateSurface = "update_dialog" | "update_button";

export type AnalyticsOperations = {
  mod_download: {
    start: ModAction & {
      operation_kind: "download" | "retry" | "reinstall";
      file_count: number;
    };
    result: NoProperties;
  };
  mod_install: {
    start: ModAction & {
      operation_kind: "install" | "enable" | "reinstall" | "randomize";
    };
    result: { vpk_count?: number };
  };
  game_launch: {
    start: { launch_mode: "vanilla" | "modded" };
    result: { enabled_mod_count?: number };
  };
  library_mod_state: {
    start: { mod_id: string; action: "delete" | "disable" };
    result: NoProperties;
  };
  profile_import: {
    start: {
      destination: "new_profile" | "current_profile";
      mod_count: number;
    };
    result: { imported_mod_count?: number; unavailable_mod_count?: number };
  };
  mod_update: {
    start: { mod_count: number };
    result: { updated_mod_count?: number; failed_mod_count?: number };
  };
  crosshair_apply: {
    start: { entry_point: "library" | "editor" };
    result: NoProperties;
  };
  foundry_export: {
    start: { edited_asset_count: number };
    result: NoProperties;
  };
  app_update: {
    start: { target_version: string; entry_point: UpdateSurface };
    result: NoProperties;
  };
};
export type AnalyticsOperation = keyof AnalyticsOperations;
export type AnalyticsEvents = {
  app_ready: {
    total_mods_at_startup: number;
    installed_mod_count: number;
    total_profiles_at_startup: number;
  };
  first_eligible_use: { has_existing_mods: boolean };
  first_install_completed: NoProperties;
  first_modded_launch: NoProperties;
  page_viewed: { page: string; tab?: string };
  profile_created: { initial_mod_count: number };
  profile_shared: { mod_count: number; share_method: "link" | "export" };
  setting_changed: { setting_key: string; enabled: boolean };
  addon_analysis_started: { file_count: number };
  addon_analysis_completed: {
    file_count: number;
    identified_count: number;
    duration_seconds: number;
    identification_rate: number;
  };
  profile_switched: {
    enabled_mods?: number;
    disabled_mods?: number;
    duration_seconds?: number;
  };
  mods_reordered: {
    mod_count?: number;
    reorder_method?: "drag_drop" | "manual";
    duration_seconds?: number;
  };
  catalog_item_opened: ModAction;
  catalog_results_shown: {
    entry_point: "search" | "catalog";
    content_type: "mod" | "map" | "sound" | "wip";
    query_length: number;
    result_count: number;
    has_results: boolean;
    category_filter_count: number;
    hero_filter_count: number;
  };
  update_offered: { target_version: string; entry_point: UpdateSurface };
  update_dismissed: { target_version?: string; entry_point: UpdateSurface };
  setup_result: { outcome: "completed" | "skipped"; last_step: number };
  autoexec_saved: { has_launchable_content: boolean };
};
export type AnalyticsMilestone =
  | "first_eligible_use"
  | "first_install_completed"
  | "first_modded_launch";
export type EventArguments<K extends keyof AnalyticsEvents> =
  Record<string, never> extends AnalyticsEvents[K]
    ? [properties?: AnalyticsEvents[K]]
    : [properties: AnalyticsEvents[K]];
export interface AnalyticsAttempt<K extends AnalyticsOperation> {
  finish: (
    outcome: AnalyticsOutcome,
    result?: AnalyticsOperations[K]["result"],
  ) => boolean;
}
