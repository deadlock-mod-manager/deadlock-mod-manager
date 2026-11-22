import {
  createPluginClient,
  decode,
  defineCommand,
} from "@deadlock-mods/plugin-sdk";

export type CommandError = { code: string; message: string };

/** Display values for what the user granted in DMM; not authority. */
export type Grants = {
  file: { name: string } | null;
  profile: { folder: string } | null;
};

export type BuildEntry = {
  hash: string;
  size: number;
  /** VPK resource count; `null` for files that are not VPKs. */
  resources: number | null;
  stagedAt: string;
  deployed: boolean;
  /** `null` when DMM's staging list could not be read. */
  available: boolean | null;
};

const WATCH_STATES = [
  "missing",
  "changing",
  "waitingForMarker",
  "invalid",
  "ready",
] as const;
export type WatchState = (typeof WATCH_STATES)[number];

export type Settings = { requireReadyMarker: boolean };
export type UiState = { historyExpanded: boolean };

export type BridgeStatus = {
  grants: Grants | null;
  grantsError: CommandError | null;
  listError: CommandError | null;
  builds: BuildEntry[];
  deployedHash: string | null;
  pendingHash: string | null;
  watch: WatchState | null;
  watchError: CommandError | null;
  deployError: CommandError | null;
  settings: Settings;
  ui: UiState;
};

const commandError: decode.Decoder<CommandError> = (value, path) => {
  const source = decode.object(value, path);
  return {
    code: decode.field(source, "code", decode.string, path),
    message: decode.field(source, "message", decode.string, path),
  };
};

const fileGrant: decode.Decoder<{ name: string }> = (value, path) => ({
  name: decode.field(decode.object(value, path), "name", decode.string, path),
});

const profileGrant: decode.Decoder<{ folder: string }> = (value, path) => ({
  folder: decode.field(
    decode.object(value, path),
    "folder",
    decode.string,
    path,
  ),
});

const grants: decode.Decoder<Grants> = (value, path) => {
  const source = decode.object(value, path);
  return {
    file: decode.field(source, "file", decode.nullable(fileGrant), path),
    profile: decode.field(
      source,
      "profile",
      decode.nullable(profileGrant),
      path,
    ),
  };
};

const build: decode.Decoder<BuildEntry> = (value, path) => {
  const source = decode.object(value, path);
  return {
    hash: decode.field(source, "hash", decode.string, path),
    size: decode.field(source, "size", decode.number, path),
    resources: decode.field(
      source,
      "resources",
      decode.nullable(decode.number),
      path,
    ),
    stagedAt: decode.field(source, "stagedAt", decode.string, path),
    deployed: decode.field(source, "deployed", decode.boolean, path),
    available: decode.field(
      source,
      "available",
      decode.nullable(decode.boolean),
      path,
    ),
  };
};

const settings: decode.Decoder<Settings> = (value, path) => ({
  requireReadyMarker: decode.field(
    decode.object(value, path),
    "requireReadyMarker",
    decode.boolean,
    path,
  ),
});

const uiState: decode.Decoder<UiState> = (value, path) => ({
  historyExpanded: decode.field(
    decode.object(value, path),
    "historyExpanded",
    decode.boolean,
    path,
  ),
});

const bridgeStatus: decode.Decoder<BridgeStatus> = (value, path) => {
  const source = decode.object(value, path);
  const nullableError = decode.nullable(commandError);
  const nullableString = decode.nullable(decode.string);
  return {
    grants: decode.field(source, "grants", decode.nullable(grants), path),
    grantsError: decode.field(source, "grantsError", nullableError, path),
    listError: decode.field(source, "listError", nullableError, path),
    builds: decode.field(source, "builds", decode.array(build), path),
    deployedHash: decode.field(source, "deployedHash", nullableString, path),
    pendingHash: decode.field(source, "pendingHash", nullableString, path),
    watch: decode.field(
      source,
      "watch",
      decode.nullable(decode.oneOf(WATCH_STATES)),
      path,
    ),
    watchError: decode.field(source, "watchError", nullableError, path),
    deployError: decode.field(source, "deployError", nullableError, path),
    settings: decode.field(source, "settings", settings, path),
    ui: decode.field(source, "ui", uiState, path),
  };
};

const client = createPluginClient();
const configureCommand = defineCommand<Settings, Settings>(
  "configure",
  settings,
);
const setUiStateCommand = defineCommand<UiState, UiState>(
  "setUiState",
  uiState,
);

export const fetchStatus = () => client.status(bridgeStatus);

export const deployBuild = (hash: string) =>
  client.deploy({ hash }, bridgeStatus);

export const saveSettings = (next: Settings) =>
  client.call(configureCommand, next);

export const saveUiState = (next: UiState) =>
  client.call(setUiStateCommand, next);
