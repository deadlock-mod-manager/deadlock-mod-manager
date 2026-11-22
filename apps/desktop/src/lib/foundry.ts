import { invoke } from "@tauri-apps/api/core";
import type {
  FoundryBuildResult,
  FoundryCardPreview,
  FoundryExportRequest,
  FoundryExportResult,
  FoundryManifest,
  FoundryPaint,
  FoundryPaintPart,
  FoundryPaintResult,
  FoundryPatternId,
  FoundryPaintTargetId,
  FoundryPaintTargetInfo,
  FoundryRemovedParts,
  FoundryReplacementResult,
  FoundrySoundPreview,
  FoundrySoundSettings,
  FoundryTexture,
  FoundryWorkspace,
} from "@/types/foundry";

export const analyzeFoundryVpk = async (
  filePath: string,
): Promise<FoundryManifest> => {
  return await invoke<FoundryManifest>("foundry_analyze_vpk", { filePath });
};

export const analyzeDefaultFoundryHero = async (
  heroDisplay: string,
): Promise<FoundryManifest> => {
  return await invoke<FoundryManifest>("foundry_analyze_default_hero", {
    heroDisplay,
  });
};

export const resolveModVpk = async (
  modId: string,
  installedVpks: string[] = [],
  profileFolder: string | null = null,
): Promise<string> => {
  return await invoke<string>("foundry_resolve_mod_vpk", {
    modId,
    installedVpks,
    profileFolder,
  });
};

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

export const foundrySkinPalette = async (
  filePath: string,
  textures: string[],
): Promise<string[]> => {
  return await invoke<string[]>("foundry_skin_palette", {
    filePath,
    textures,
    workspaceRoot: null,
  });
};

export const adjustFoundrySound = async (
  workspaceRoot: string,
  entryPath: string,
  templateVpkPath: string | null,
  adjust: { gainDb: number; normalize: boolean; mute: boolean },
): Promise<FoundrySoundSettings> => {
  return await invoke<FoundrySoundSettings>("foundry_adjust_sound", {
    workspaceRoot,
    entryPath,
    templateVpkPath,
    ...adjust,
  });
};

export const decodeFoundryTexture = async (
  filePath: string,
  entryPath: string,
  workspaceRoot: string | null = null,
  opaque = false,
): Promise<FoundryTexture> => {
  return await invoke<FoundryTexture>("foundry_decode_texture", {
    filePath,
    entryPath,
    workspaceRoot,
    opaque,
  });
};

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

export { decodeFoundryModel } from "./model-assets";

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

export const foundryModelParts = async (
  filePath: string,
  modelPath: string,
  heroDisplay: string | null,
): Promise<FoundryPaintPart[]> => {
  return await invoke<FoundryPaintPart[]>("foundry_model_parts", {
    filePath,
    modelPath,
    heroDisplay,
  });
};

export const paintFoundryParts = async (
  workspaceRoot: string,
  filePath: string,
  modelPath: string,
  heroDisplay: string | null,
  textures: string[],
  paint: FoundryPaint,
): Promise<FoundryPaintResult> => {
  return await invoke<FoundryPaintResult>("foundry_paint_parts", {
    workspaceRoot,
    filePath,
    modelPath,
    heroDisplay,
    textures,
    colorHex: paint.colorHex,
    saturation: paint.saturation,
    brightness: paint.brightness,
    pattern: paint.pattern === "none" ? null : paint.pattern,
    patternIntensity: paint.patternIntensity,
    patternPhase: paint.patternPhase,
  });
};

export const removeFoundryParts = async (
  workspaceRoot: string,
  filePath: string,
  modelPath: string,
  heroDisplay: string | null,
  textures: string[],
): Promise<FoundryRemovedParts> => {
  return await invoke<FoundryRemovedParts>("foundry_remove_parts", {
    workspaceRoot,
    filePath,
    modelPath,
    heroDisplay,
    textures,
  });
};

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

export const releaseFoundryArchives = async (): Promise<void> => {
  await invoke("foundry_release_archives");
};

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

export const getPrimaryModelPath = (
  manifest: FoundryManifest,
): string | null => {
  if (manifest.primaryModelPath) return manifest.primaryModelPath;
  const model = manifest.models.find((entry) => entry.path.endsWith(".vmdl_c"));
  const mesh = manifest.models.find((entry) => entry.path.endsWith(".vmesh_c"));
  return model?.path ?? mesh?.path ?? manifest.models[0]?.path ?? null;
};
