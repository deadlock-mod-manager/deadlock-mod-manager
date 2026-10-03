import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { DEFAULT_CROSSHAIR_CONFIG } from "@deadlock-mods/crosshair/types";
import type { ModDto } from "@deadlock-mods/shared";
import { generateFallbackModSVG } from "@/lib/file-patterns";
import {
  type LocalMod,
  type ModDownloadItem,
  type ModFileTree,
  ModStatus,
} from "@/types/mods";
import type { ModProfile } from "@/types/profiles";

/** Mirrors `commands/mod_interchange/format.rs` (rfcs/001-mod-interchange/proposal.md). */
export type InterchangeFile = {
  name: string;
  path: string;
  sha256?: string;
  size?: number;
  selected?: boolean;
};

export type InterchangeOrigin =
  | {
      provider: "gamebanana";
      submissionType: "mod" | "sound";
      submissionId: string;
      fileId?: number;
      fileName?: string;
    }
  | { provider: "local"; localId?: string };

export type InterchangeMod = {
  key: string;
  name: string;
  enabled: boolean;
  order: number;
  origin: InterchangeOrigin;
  author: string | null;
  description: string | null;
  category: string | null;
  hero: string | null;
  thumbnailUrl: string | null;
  link: string | null;
  nsfw: boolean | null;
  files: InterchangeFile[];
};

export type InterchangeProfileMod = {
  modKey: string;
  enabled: boolean;
  order: number;
};

export type InterchangeProfile = {
  key: string;
  name: string;
  active: boolean;
  description: string | null;
  mods: InterchangeProfileMod[];
  crosshairKey: string | null;
  autoexec: string[] | null;
};

export type InterchangeCrosshair = {
  key: string;
  name: string;
  active: boolean;
  convars: Record<string, string>;
};

export type InterchangeSection = "mods" | "profiles" | "crosshairs";

export type InterchangeDocument = {
  format: string;
  version: number;
  createdAt: string | null;
  source: { manager: string; managerVersion?: string; profileName?: string };
  contents: string[];
  mods: InterchangeMod[];
  profiles: InterchangeProfile[];
  crosshairs: InterchangeCrosshair[];
  warnings: string[];
};

export type InterchangeSourceInfo = {
  id: string;
  name: string;
  sections: string[];
  found: boolean;
  location: string | null;
  detail: string | null;
  searched: string[];
};

export type ImportStatus = "imported" | "skipped" | "failed";

export type ImportedMod = {
  key: string;
  modId: string | null;
  status: ImportStatus;
  reason: string | null;
  enabled: boolean;
  adoptedInPlace: boolean;
  installedVpks: string[];
  fileTree: ModFileTree | null;
  installOrder: number | null;
};

export type InterchangeImportReport = {
  results: ImportedMod[];
  warnings: string[];
};

export type InterchangeProgress = {
  current: number;
  total: number;
  name: string;
};

export type IdentifyResult = {
  modId: string;
  remoteId: string | null;
  modName: string | null;
  modAuthor: string | null;
  certainty: number | null;
  error: string | null;
};

export type ExportModInput = {
  modId: string;
  name: string;
  enabled: boolean;
  order: number;
  author: string | null;
  description: string | null;
  category: string | null;
  hero: string | null;
  thumbnailUrl: string | null;
  link: string | null;
  nsfw: boolean | null;
  fileId: number | null;
  fileName: string | null;
};

export type ExportProfileInput = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  profileFolder: string | null;
  crosshairKey: string | null;
  mods: ExportModInput[];
};

export type InterchangeExportReport = {
  bundlePath: string;
  exported: number;
  profiles: number;
  crosshairs: number;
  skipped: Array<{ modId: string; name: string; reason: string }>;
};

export const hasSection = (
  document: InterchangeDocument,
  section: InterchangeSection,
) =>
  section === "mods"
    ? true
    : section === "profiles"
      ? document.profiles.length > 0
      : document.crosshairs.length > 0;

const LOCAL_ID = /^local-[0-9a-f-]{36}$/i;
export const isLocalModId = (id: string) => LOCAL_ID.test(id);

/** The library id DMM gives a GameBanana entry; must match
 *  `import.rs::dmm_mod_id`. Local entries resolve through the import ledger. */
export const libraryIdForEntry = (
  entry: InterchangeMod,
  ledger: Record<string, string> = {},
): string | null => {
  if (ledger[entry.key]) return ledger[entry.key];
  if (entry.origin.provider !== "gamebanana") return null;
  return entry.origin.submissionType === "sound"
    ? `snd-${entry.origin.submissionId}`
    : entry.origin.submissionId;
};

const GAMEBANANA_FILE_URL = /^gamebanana-file:\/\/[^/]+\/(\d+)$/;
const GAMEBANANA_DL_URL = /gamebanana\.com\/dl\/(\d+)/i;

export const fileIdFromDownloadUrl = (url: string): number | null => {
  const match = GAMEBANANA_FILE_URL.exec(url) ?? GAMEBANANA_DL_URL.exec(url);
  const id = match?.[1] ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** Turn what a user pastes (a GameBanana link or a bare id) into a DMM mod
 *  id: `123` for mods, `snd-123` for sounds. */
export const parseGameBananaReference = (input: string): string | null => {
  const text = input.trim();
  const bare = /^(snd-)?([1-9]\d*)$/i.exec(text);
  if (bare) return bare[1] ? `snd-${bare[2]}` : bare[2];
  const link = /gamebanana\.com\/(mods|sounds)\/([1-9]\d*)/i.exec(text);
  if (!link) return null;
  return link[1].toLowerCase() === "sounds" ? `snd-${link[2]}` : link[2];
};

const isHttpUrl = (value: string | null | undefined): value is string =>
  !!value && /^https?:\/\//i.test(value);

/** What the export command needs from a library entry. */
export const exportInputFromLocalMod = (
  mod: LocalMod,
  enabled: boolean,
  order: number,
): ExportModInput => {
  const download = mod.selectedDownloads?.[0];
  return {
    modId: mod.remoteId,
    name: mod.name,
    enabled,
    order,
    author: mod.author || null,
    description: mod.description ?? null,
    category: mod.category || null,
    hero: mod.heroOverride ?? mod.detectedHero ?? mod.hero ?? null,
    thumbnailUrl: mod.images?.find(isHttpUrl) ?? null,
    link: isHttpUrl(mod.remoteUrl) ? mod.remoteUrl : null,
    nsfw: mod.isNSFW ?? null,
    fileId: download ? fileIdFromDownloadUrl(download.url) : null,
    fileName: download?.name ?? null,
  };
};

export const exportInputFromProfile = (
  profile: ModProfile,
  active: boolean,
): ExportProfileInput => ({
  id: profile.id,
  name: profile.name,
  description: profile.description ?? null,
  active,
  profileFolder: profile.folderName,
  crosshairKey: null,
  mods: [...profile.mods]
    .sort((a, b) => (a.installOrder ?? 0) - (b.installOrder ?? 0))
    .map((mod, index) =>
      exportInputFromLocalMod(
        mod,
        profile.enabledMods[mod.remoteId]?.enabled ?? false,
        index,
      ),
    ),
});

const gameBananaPage = (origin: InterchangeOrigin): string | null => {
  if (origin.provider !== "gamebanana") return null;
  const section = origin.submissionType === "sound" ? "sounds" : "mods";
  return `https://gamebanana.com/${section}/${origin.submissionId}`;
};

/** A library entry built only from the interchange data, used for local mods
 *  and whenever the GameBanana catalog cannot describe a submission. */
export const placeholderModDto = (
  entry: InterchangeMod,
  modId: string,
): ModDto => {
  const now = new Date();
  const images = isHttpUrl(entry.thumbnailUrl)
    ? [entry.thumbnailUrl]
    : [
        `data:image/svg+xml;utf8,${encodeURIComponent(generateFallbackModSVG())}`,
      ];
  const isSound =
    entry.origin.provider === "gamebanana" &&
    entry.origin.submissionType === "sound";
  return {
    id: modId,
    remoteId: modId,
    name: entry.name,
    description: entry.description ?? "",
    remoteUrl: entry.link ?? gameBananaPage(entry.origin) ?? "local://manual",
    category: entry.category ?? (isSound ? "Sounds" : "Other"),
    likes: 0,
    author: entry.author ?? "Unknown",
    downloadable: entry.origin.provider === "gamebanana",
    remoteAddedAt: now,
    remoteUpdatedAt: now,
    tags: [],
    images,
    hero: entry.hero,
    isAudio: isSound,
    isMap: /\bmaps?\b/i.test(entry.category ?? ""),
    audioUrl: null,
    downloadCount: 0,
    isNSFW: entry.nsfw ?? false,
    isObsolete: false,
    isBlacklisted: false,
    blacklistReason: null,
    blacklistedAt: null,
    blacklistedBy: null,
    filesUpdatedAt: null,
    metadata: null,
    dependencies: null,
    overrides: null,
    createdAt: now,
    updatedAt: now,
  };
};

/** Records which GameBanana file the VPKs came from, so update checks compare
 *  against the right version instead of treating the mod as unknown. */
export const selectedDownloadsForEntry = (
  entry: InterchangeMod,
  modId: string,
): ModDownloadItem[] | undefined => {
  if (entry.origin.provider !== "gamebanana" || !entry.origin.fileId) {
    return undefined;
  }
  const size = entry.files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  return [
    {
      url: `gamebanana-file://${encodeURIComponent(modId)}/${entry.origin.fileId}`,
      size,
      name: entry.origin.fileName ?? entry.name,
      description: null,
      createdAt: null,
      updatedAt: null,
      md5Checksum: null,
    },
  ];
};

/** The library record for an imported mod. Catalog data (when available)
 *  wins for descriptive fields; install state always comes from the import. */
export const buildImportedLocalMod = (
  entry: InterchangeMod,
  result: ImportedMod & { modId: string },
  catalogMod: ModDto | null,
): { mod: ModDto; additional: Partial<LocalMod> } => {
  const placeholder = placeholderModDto(entry, result.modId);
  const mod: ModDto = catalogMod
    ? { ...catalogMod, id: result.modId, remoteId: result.modId }
    : placeholder;
  const selectedDownloads = selectedDownloadsForEntry(entry, result.modId);
  return {
    mod,
    additional: {
      status: result.enabled ? ModStatus.Installed : ModStatus.Downloaded,
      installedVpks: result.installedVpks,
      installedFileTree: result.fileTree ?? undefined,
      installOrder: result.installOrder ?? undefined,
      downloadedAt: new Date(),
      ...(selectedDownloads ? { selectedDownloads } : {}),
    },
  };
};

/** The document restricted to one profile: its mods, in its order, with its
 *  enabled state. Feeds a per-profile import. */
export const documentForProfile = (
  document: InterchangeDocument,
  profile: InterchangeProfile,
): InterchangeDocument => {
  const byKey = new Map(document.mods.map((mod) => [mod.key, mod]));
  const mods = profile.mods.flatMap((entry, index) => {
    const mod = byKey.get(entry.modKey);
    return mod ? [{ ...mod, enabled: entry.enabled, order: index }] : [];
  });
  return { ...document, mods, profiles: [], crosshairs: [] };
};

/** `name`, or `name (2)`, `name (3)` ... when a profile already uses it. */
export const uniqueName = (name: string, taken: readonly string[]): string => {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  const base = name.trim() || "Imported profile";
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
};

const numberConvar = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const boolConvar = (value: string | undefined): boolean | null =>
  value === undefined ? null : value === "true" || value === "1";

/** DMM's crosshair model from game convars. Convars DMM does not model
 *  (outline colors, dot size, ...) are ignored; missing ones use defaults. */
export const crosshairFromConvars = (
  convars: Record<string, string>,
): CrosshairConfig | null => {
  const known = Object.keys(convars).some((key) =>
    key.startsWith("citadel_crosshair_"),
  );
  if (!known) return null;
  const pick = (convar: string, fallback: number) =>
    numberConvar(convars[convar]) ?? fallback;
  const d = DEFAULT_CROSSHAIR_CONFIG;
  const pipBorder =
    boolConvar(convars.citadel_crosshair_pip_border) ??
    (pick("citadel_crosshair_pip_outline_border", 0) > 0 ? true : d.pipBorder);
  return {
    ...d,
    gap: pick("citadel_crosshair_pip_gap", d.gap),
    width: pick("citadel_crosshair_pip_width", d.width),
    height: pick("citadel_crosshair_pip_height", d.height),
    pipOpacity: pick("citadel_crosshair_pip_opacity", d.pipOpacity),
    dotOpacity: pick("citadel_crosshair_dot_opacity", d.dotOpacity),
    dotOutlineOpacity: pick(
      "citadel_crosshair_dot_outline_opacity",
      d.dotOutlineOpacity,
    ),
    color: {
      r: pick("citadel_crosshair_color_r", d.color.r),
      g: pick("citadel_crosshair_color_g", d.color.g),
      b: pick("citadel_crosshair_color_b", d.color.b),
    },
    pipBorder,
    pipGapStatic:
      boolConvar(convars.citadel_crosshair_pip_gap_static) ?? d.pipGapStatic,
  };
};

export const crosshairToConvars = (
  config: CrosshairConfig,
): Record<string, string> => ({
  citadel_crosshair_pip_gap: String(config.gap),
  citadel_crosshair_pip_width: String(config.width),
  citadel_crosshair_pip_height: String(config.height),
  citadel_crosshair_pip_opacity: String(config.pipOpacity),
  citadel_crosshair_dot_opacity: String(config.dotOpacity),
  citadel_crosshair_dot_outline_opacity: String(config.dotOutlineOpacity),
  citadel_crosshair_color_r: String(config.color.r),
  citadel_crosshair_color_g: String(config.color.g),
  citadel_crosshair_color_b: String(config.color.b),
  citadel_crosshair_pip_border: String(config.pipBorder),
  citadel_crosshair_pip_gap_static: String(config.pipGapStatic),
});
