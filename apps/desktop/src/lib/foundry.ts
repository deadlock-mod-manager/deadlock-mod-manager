import { invoke } from "@tauri-apps/api/core";
import type {
  FoundryBuildResult,
  FoundryCardPreview,
  FoundryExportRequest,
  FoundryExportResult,
  FoundryManifest,
  FoundryModel,
  FoundryPaint,
  FoundryPaintResult,
  FoundryPatternId,
  FoundryPaintTargetId,
  FoundryPaintTargetInfo,
  FoundryReplacementResult,
  FoundrySoundPreview,
  FoundryTexture,
  FoundryWorkspace,
} from "@/types/foundry";

/**
 * Parse a skin VPK and return its entries grouped by editing category. The
 * backend flags non-hero (map) mods via `isHeroSkin = false` so the Foundry can
 * refuse them before opening the editor.
 */
export const analyzeFoundryVpk = async (
  filePath: string,
): Promise<FoundryManifest> => {
  return await invoke<FoundryManifest>("foundry_analyze_vpk", { filePath });
};

/**
 * Open the base game's default skin assets for one hero from `pak01_dir.vpk`.
 * This is read-only and does not create or download a mod.
 */
export const analyzeDefaultFoundryHero = async (
  heroDisplay: string,
): Promise<FoundryManifest> => {
  return await invoke<FoundryManifest>("foundry_analyze_default_hero", {
    heroDisplay,
  });
};

/**
 * Resolve the absolute path to a stored mod's primary VPK so it can be imported
 * into the Foundry without a manual file pick.
 */
export const resolveModVpk = async (
  modId: string,
  profileFolder: string | null = null,
): Promise<string> => {
  return await invoke<string>("foundry_resolve_mod_vpk", {
    modId,
    profileFolder,
  });
};

/**
 * Unpack the loaded skin into an editable file tree. Every edit writes into that
 * tree; the user's original VPK is never touched.
 */
export const prepareFoundryWorkspace = async (
  filePath: string,
  name: string,
  entries: string[] | null = null,
): Promise<FoundryWorkspace> => {
  return await invoke<FoundryWorkspace>("foundry_prepare_workspace", {
    filePath,
    name,
    entries,
  });
};

/** Pack the workspace into a VPK, either to `outputPath` or into the workspace. */
export const buildFoundryVpk = async (
  workspaceRoot: string,
  outputPath: string | null = null,
  name: string | null = null,
): Promise<FoundryBuildResult> => {
  return await invoke<FoundryBuildResult>("foundry_build_workspace_vpk", {
    workspaceRoot,
    outputPath,
    name,
  });
};

/**
 * Replace one workspace file. A PNG/JPG handed to a `.vtex_c` entry is re-encoded
 * into that texture's container; any other file must already match the entry's
 * compiled format.
 */
export const replaceFoundryFile = async (
  workspaceRoot: string,
  entryPath: string,
  sourceFilePath: string,
  templateVpkPath: string | null,
): Promise<FoundryReplacementResult> => {
  return await invoke<FoundryReplacementResult>(
    "foundry_replace_workspace_file",
    { workspaceRoot, entryPath, sourceFilePath, templateVpkPath },
  );
};

/** Undo every edit to one entry, restoring the packed original. */
export const revertFoundryFile = async (
  workspaceRoot: string,
  entryPath: string,
  templateVpkPath: string | null,
): Promise<void> => {
  await invoke("foundry_revert_workspace_file", {
    workspaceRoot,
    entryPath,
    templateVpkPath,
  });
};

/**
 * Decode a `.vtex_c` entry (card or texture) to a PNG data URL for previewing,
 * preferring the workspace's edited copy when one exists.
 */
export const decodeFoundryTexture = async (
  filePath: string,
  entryPath: string,
  workspaceRoot: string | null = null,
): Promise<FoundryTexture> => {
  return await invoke<FoundryTexture>("foundry_decode_texture", {
    filePath,
    entryPath,
    workspaceRoot,
  });
};

/**
 * Decode every hero-card texture for the active skin and the matching base-game
 * defaults. The Foundry starts this in the background as soon as a skin loads.
 */
export const decodeFoundryCards = async (
  filePath: string,
  hero: string | null,
  heroDisplay: string | null,
  workspaceRoot: string | null = null,
): Promise<FoundryCardPreview[]> => {
  return await invoke<FoundryCardPreview[]>("foundry_decode_cards", {
    filePath,
    hero,
    heroDisplay,
    workspaceRoot,
  });
};

/**
 * Decode a `.vmesh_c`, or assemble every mesh a `.vmdl_c` references, to a GLB
 * data URL for the 3D preview. Passing the workspace makes the preview show the
 * user's painted textures and stands the hero in its idle pose.
 */
export const decodeFoundryModel = async (
  filePath: string,
  entryPath: string,
  workspaceRoot: string | null = null,
): Promise<FoundryModel> => {
  return await invoke<FoundryModel>("foundry_decode_model", {
    filePath,
    entryPath,
    workspaceRoot,
  });
};

/** How much of the hero each paint target covers in the loaded skin. */
export const foundryPaintTargets = async (
  filePath: string,
  workspaceRoot: string | null,
  heroDisplay: string | null,
): Promise<FoundryPaintTargetInfo[]> => {
  return await invoke<FoundryPaintTargetInfo[]>("foundry_paint_targets", {
    filePath,
    workspaceRoot,
    heroDisplay,
  });
};

/** Recolor one part of the hero across every texture (and particle) it covers. */
export const paintFoundryTarget = async (
  workspaceRoot: string,
  filePath: string,
  target: FoundryPaintTargetId,
  heroDisplay: string | null,
  paint: FoundryPaint,
): Promise<FoundryPaintResult> => {
  return await invoke<FoundryPaintResult>("foundry_paint_target", {
    workspaceRoot,
    filePath,
    target,
    heroDisplay,
    colorHex: paint.colorHex,
    saturation: paint.saturation,
    brightness: paint.brightness,
    pattern: paint.pattern === "none" ? null : paint.pattern,
    patternIntensity: paint.patternIntensity,
    patternPhase: paint.patternPhase,
  });
};

/** A PNG swatch of one pattern, for the picker tiles. */
export const foundryPatternSwatch = async (
  pattern: Exclude<FoundryPatternId, "none">,
  phase = 0,
  size = 96,
): Promise<string> => {
  return await invoke<string>("foundry_pattern_swatch", {
    pattern,
    phase,
    size,
  });
};

/** Pack the workspace and deliver it to the chosen destination. */
export const exportFoundryWorkspace = async (
  workspaceRoot: string,
  request: FoundryExportRequest,
): Promise<FoundryExportResult> => {
  return await invoke<FoundryExportResult>("foundry_export_workspace", {
    workspaceRoot,
    destination: request.destination,
    name: request.name ?? null,
    outputPath: request.outputPath ?? null,
    sourcePath: request.sourcePath ?? null,
  });
};

/**
 * Drop the backend's cached VPK indexes. Worth doing when a skin is unloaded: a
 * parsed pak01 is a large index to keep around for nothing.
 */
export const releaseFoundryArchives = async (): Promise<void> => {
  await invoke("foundry_release_archives");
};

/**
 * Extract a playable clip from a compiled `.vsnd_c`. Clips that aren't MP3
 * encoded have no preview and reject; callers treat that as "not playable".
 */
export const decodeFoundrySound = async (
  filePath: string,
  entryPath: string,
  workspaceRoot: string | null = null,
): Promise<FoundrySoundPreview> => {
  return await invoke<FoundrySoundPreview>("foundry_decode_sound", {
    filePath,
    entryPath,
    workspaceRoot,
  });
};
