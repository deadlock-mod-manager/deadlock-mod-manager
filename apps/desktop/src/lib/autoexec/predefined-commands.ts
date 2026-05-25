import type { LucideIcon } from "@deadlock-mods/ui/icons";
import {
  Film,
  Gauge,
  Globe,
  Keyboard,
  Lock,
  Map,
  Mic,
  Monitor,
  MousePointer2,
  ShoppingCart,
  Sparkles,
  Volume2,
  Wifi,
} from "@deadlock-mods/ui/icons";

export type AutoexecCategoryId =
  | "performance"
  | "network"
  | "hudUi"
  | "minimap"
  | "matchmaking"
  | "privateLobbyDefaults"
  | "mouseSensitivity"
  | "abilityQuickcast"
  | "buildItems"
  | "audio"
  | "voiceChat"
  | "visualEffects"
  | "replaySpectator";

export type AutoexecCommandIntent = "default";

export interface PredefinedAutoexecCommand {
  id: string;
  command: string;
  value: string;
  intent?: AutoexecCommandIntent;
}

export interface AutoexecCategoryDefinition {
  id: AutoexecCategoryId;
  icon: LucideIcon;
  commands: PredefinedAutoexecCommand[];
}

export interface FlatAutoexecCommand extends PredefinedAutoexecCommand {
  categoryId: AutoexecCategoryId;
}

export const AUTOEXEC_CATEGORIES: AutoexecCategoryDefinition[] = [
  {
    id: "performance",
    icon: Gauge,
    commands: [
      { id: "fpsMax", command: "fps_max", value: "240" },
      { id: "fpsMaxUi", command: "fps_max_ui", value: "144" },
      {
        id: "engineNoFocusSleep",
        command: "engine_no_focus_sleep",
        value: "0",
      },
      {
        id: "engineLowLatencySleepAfterClientTick",
        command: "engine_low_latency_sleep_after_client_tick",
        value: "true",
      },
    ],
  },
  {
    id: "network",
    icon: Wifi,
    commands: [
      { id: "rate", command: "rate", value: "1000000" },
      { id: "clUpdaterate", command: "cl_updaterate", value: "20" },
      { id: "clInterpRatio", command: "cl_interp_ratio", value: "0" },
      {
        id: "clLagcompensation",
        command: "cl_lagcompensation",
        value: "true",
      },
      {
        id: "clHudTelemetryNetMisdeliveryShow",
        command: "cl_hud_telemetry_net_misdelivery_show",
        value: "1",
      },
      {
        id: "clHudTelemetryNetQualityGraphShow",
        command: "cl_hud_telemetry_net_quality_graph_show",
        value: "0",
      },
    ],
  },
  {
    id: "hudUi",
    icon: Monitor,
    commands: [
      {
        id: "citadelUnitStatusUseNew",
        command: "citadel_unit_status_use_new",
        value: "true",
      },
      {
        id: "citadelHudVisible",
        command: "citadel_hud_visible",
        value: "true",
        intent: "default",
      },
      {
        id: "citadelHideReplayHud",
        command: "citadel_hide_replay_hud",
        value: "false",
        intent: "default",
      },
      {
        id: "citadelHintSystemDisable",
        command: "citadel_hint_system_disable",
        value: "true",
      },
      {
        id: "citadelAlwaysShowActiveHudStats",
        command: "citadel_always_show_active_hud_stats",
        value: "true",
      },
      {
        id: "citadelShowActiveSlotPopup",
        command: "citadel_show_active_slot_popup",
        value: "true",
      },
      {
        id: "citadelShowAllPurchaseToasts",
        command: "citadel_show_all_purchase_toasts",
        value: "true",
      },
      {
        id: "citadelShopDefaultTab",
        command: "citadel_shop_default_tab",
        value: "-1",
        intent: "default",
      },
      {
        id: "clAutoCursorScale",
        command: "cl_auto_cursor_scale",
        value: "true",
      },
      {
        id: "clShowfps",
        command: "cl_showfps",
        value: "0",
        intent: "default",
      },
      {
        id: "clShowframenumber",
        command: "cl_showframenumber",
        value: "false",
        intent: "default",
      },
      {
        id: "clTrueviewShowStatus",
        command: "cl_trueview_show_status",
        value: "2",
      },
    ],
  },
  {
    id: "minimap",
    icon: Map,
    commands: [
      {
        id: "minimapUpdateRateHz",
        command: "minimap_update_rate_hz",
        value: "60",
        intent: "default",
      },
      {
        id: "citadelMinimapUnitClickRadius",
        command: "citadel_minimap_unit_click_radius",
        value: "200",
        intent: "default",
      },
      {
        id: "citadelMinimapPlayerWidth",
        command: "citadel_minimap_player_width",
        value: "7",
        intent: "default",
      },
      {
        id: "citadelMinimapLocalPlayerWidth",
        command: "citadel_minimap_local_player_width",
        value: "12",
        intent: "default",
      },
      {
        id: "citadelMinimapMaxIconShrink",
        command: "citadel_minimap_max_icon_shrink",
        value: "0.8",
        intent: "default",
      },
      {
        id: "citadelMinimapOverlapScanDistance",
        command: "citadel_minimap_overlap_scan_distance",
        value: "12.5",
        intent: "default",
      },
      {
        id: "citadelMinimapZipLineThickness",
        command: "citadel_minimap_zip_line_thickness",
        value: "2",
        intent: "default",
      },
      {
        id: "citadelMinimapSpectatorFowTeamView",
        command: "citadel_minimap_spectator_fow_team_view",
        value: "1",
        intent: "default",
      },
    ],
  },
  {
    id: "matchmaking",
    icon: Globe,
    commands: [
      { id: "mmPreferSoloOnly", command: "mm_prefer_solo_only", value: "1" },
    ],
  },
  {
    id: "privateLobbyDefaults",
    icon: Lock,
    commands: [
      {
        id: "citadelPrivateLobbyBotDifficulty",
        command: "citadel_private_lobby_bot_difficulty",
        value: "0",
        intent: "default",
      },
      {
        id: "citadelPrivateLobbyCheatsEnabled",
        command: "citadel_private_lobby_cheats_enabled",
        value: "false",
        intent: "default",
      },
      {
        id: "citadelPrivateLobbyDuplicateHeroesEnabled",
        command: "citadel_private_lobby_duplicate_heroes_enabled",
        value: "false",
        intent: "default",
      },
      {
        id: "citadelPrivateLobbyIsPubliclyVisible",
        command: "citadel_private_lobby_is_publicly_visible",
        value: "false",
        intent: "default",
      },
      {
        id: "citadelPrivateLobbyRandomizeLanes",
        command: "citadel_private_lobby_randomize_lanes",
        value: "false",
        intent: "default",
      },
      {
        id: "citadelPrivateLobbyServerRegion",
        command: "citadel_private_lobby_server_region",
        value: "1",
        intent: "default",
      },
    ],
  },
  {
    id: "mouseSensitivity",
    icon: MousePointer2,
    commands: [
      {
        id: "fovDesired",
        command: "fov_desired",
        value: "75",
        intent: "default",
      },
      { id: "mYaw", command: "m_yaw", value: "0.022", intent: "default" },
      {
        id: "mPitch",
        command: "m_pitch",
        value: "0.022",
        intent: "default",
      },
      {
        id: "zoomSensitivityRatio",
        command: "zoom_sensitivity_ratio",
        value: "0.818933027098955175",
        intent: "default",
      },
      {
        id: "clCitadelZoomIsToggle",
        command: "cl_citadel_zoom_is_toggle",
        value: "false",
        intent: "default",
      },
    ],
  },
  {
    id: "abilityQuickcast",
    icon: Keyboard,
    commands: [
      {
        id: "clCitadelQuickcastAbility1",
        command: "cl_citadel_quickcast_ability1",
        value: "0",
        intent: "default",
      },
      {
        id: "clCitadelQuickcastAbility2",
        command: "cl_citadel_quickcast_ability2",
        value: "0",
        intent: "default",
      },
      {
        id: "clCitadelQuickcastAbility3",
        command: "cl_citadel_quickcast_ability3",
        value: "0",
        intent: "default",
      },
      {
        id: "clCitadelQuickcastAbility4",
        command: "cl_citadel_quickcast_ability4",
        value: "0",
        intent: "default",
      },
    ],
  },
  {
    id: "buildItems",
    icon: ShoppingCart,
    commands: [
      {
        id: "citadelAutoQueueBuild",
        command: "citadel_auto_queue_build",
        value: "false",
      },
    ],
  },
  {
    id: "audio",
    icon: Volume2,
    commands: [
      { id: "volume", command: "volume", value: "1", intent: "default" },
      {
        id: "sndGamevolume",
        command: "snd_gamevolume",
        value: "1",
        intent: "default",
      },
      {
        id: "sndGamevoicevolume",
        command: "snd_gamevoicevolume",
        value: "1",
        intent: "default",
      },
      {
        id: "sndVoipvolume",
        command: "snd_voipvolume",
        value: "1",
        intent: "default",
      },
      {
        id: "soundDeviceOverride",
        command: "sound_device_override",
        value: '""',
        intent: "default",
      },
    ],
  },
  {
    id: "voiceChat",
    icon: Mic,
    commands: [
      {
        id: "voiceModenable",
        command: "voice_modenable",
        value: "true",
        intent: "default",
      },
      {
        id: "voiceVox",
        command: "voice_vox",
        value: "0",
        intent: "default",
      },
      { id: "voiceThreshold", command: "voice_threshold", value: "-120" },
      {
        id: "voiceLoopback",
        command: "voice_loopback",
        value: "false",
        intent: "default",
      },
      {
        id: "voiceAlwaysSampleMic",
        command: "voice_always_sample_mic",
        value: "false",
        intent: "default",
      },
      {
        id: "voiceDeviceOverride",
        command: "voice_device_override",
        value: '""',
        intent: "default",
      },
    ],
  },
  {
    id: "visualEffects",
    icon: Sparkles,
    commands: [
      { id: "clRagdollLimit", command: "cl_ragdoll_limit", value: "20" },
      { id: "violenceAblood", command: "violence_ablood", value: "true" },
      { id: "violenceAgibs", command: "violence_agibs", value: "true" },
      { id: "violenceHblood", command: "violence_hblood", value: "true" },
      { id: "violenceHgibs", command: "violence_hgibs", value: "true" },
    ],
  },
  {
    id: "replaySpectator",
    icon: Film,
    commands: [
      {
        id: "citadelAutoHighlightSecondsBefore",
        command: "citadel_auto_highlight_seconds_before",
        value: "20",
        intent: "default",
      },
      {
        id: "citadelAutoHighlightSecondsAfter",
        command: "citadel_auto_highlight_seconds_after",
        value: "8",
        intent: "default",
      },
      {
        id: "citadelReplayManagerDownloadChunkSize",
        command: "citadel_replay_manager_download_chunk_size",
        value: "1048576",
        intent: "default",
      },
      {
        id: "citadelReplayManagerDownloadSimultaneousRequests",
        command: "citadel_replay_manager_download_simultaneous_requests",
        value: "3",
        intent: "default",
      },
    ],
  },
];

export const FLAT_AUTOEXEC_COMMANDS: FlatAutoexecCommand[] =
  AUTOEXEC_CATEGORIES.flatMap((category) =>
    category.commands.map((command) => ({
      ...command,
      categoryId: category.id,
    })),
  );
