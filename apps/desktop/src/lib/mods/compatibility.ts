import type {
  LocalizationChoice,
  LocalizationOverlayAnalysis,
} from "@/components/my-mods/localization-conflict-review";
import type {
  DataRepair,
  DataWarning,
} from "@/components/my-mods/data-compatibility-report";

export interface LocalizationResolution {
  conflictKey: string;
  winnerModId: string | null;
  winnerValue: string | null;
  winnerSourceVpk: string | null;
  useVanilla: boolean;
}

export interface LocalizationOverlayApplyResult {
  hasOverlay: boolean;
  outputPath: string | null;
  packedFiles: number;
  appliedTokens: number;
  appliedCompiledRows: number;
  dataRepairs: DataRepair[];
  dataWarnings: DataWarning[];
}

export function compatibilityResolutions(
  analysis: LocalizationOverlayAnalysis,
  choices: Readonly<Record<string, LocalizationChoice>>,
): LocalizationResolution[] {
  const resolutions: LocalizationResolution[] = [];
  for (const conflict of [
    ...analysis.conflicts,
    ...analysis.compiledDataConflicts,
  ]) {
    const choice = choices[conflict.key] ?? "load-order";
    if (choice === "load-order") continue;
    if (choice === "vanilla") {
      resolutions.push({
        conflictKey: conflict.key,
        winnerModId: null,
        winnerValue: null,
        winnerSourceVpk: null,
        useVanilla: true,
      });
      continue;
    }
    const candidate =
      conflict.candidates[Number(choice.slice("candidate:".length))];
    if (!candidate) continue;
    resolutions.push({
      conflictKey: conflict.key,
      winnerModId: candidate.modId,
      winnerValue: "value" in candidate ? candidate.value : null,
      winnerSourceVpk: candidate.sourceVpk,
      useVanilla: false,
    });
  }
  return resolutions;
}
