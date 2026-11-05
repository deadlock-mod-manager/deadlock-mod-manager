import type { LocalizationOverlayAnalysis } from "@/components/my-mods/localization-conflict-review";

/** Scope exported diagnostics to the requested mod, retaining provider identity. */
export function formatCompatibilityFindings(
  analysis: LocalizationOverlayAnalysis,
  modNames: ReadonlyMap<string, string>,
  modId?: string,
): string {
  const matches = (entry: { modId: string }) =>
    modId === undefined || entry.modId === modId;
  const unloaded = new Set(analysis.unloadedModels);
  return JSON.stringify(
    {
      report: "Deadlock Mod Manager compatibility findings",
      advisory:
        "Findings do not prove a mod is broken. Console evidence may come from a previous session.",
      mods: [...modNames]
        .filter(([id]) => modId === undefined || id === modId)
        .map(([id, name]) => ({ id, name })),
      usingOriginalFiles: analysis.excludedModIds.filter(
        (id) => modId === undefined || id === modId,
      ),
      assetWarnings: analysis.assetWarnings.filter(
        (entry) => matches(entry) && !unloaded.has(entry.filePath),
      ),
      dataWarnings: analysis.dataWarnings.filter(matches),
      hudChecks: analysis.hudChecks.filter(matches),
      sharedFiles: analysis.protectedResources.filter(
        (entry) => modId === undefined || entry.modIds.includes(modId),
      ),
      missingFiles: analysis.inputWarnings.filter(matches),
      unmanagedVpks: analysis.unmanagedVpks.filter(matches),
      animationChecks: analysis.animationChecks.filter(
        (entry) => matches(entry) && !unloaded.has(entry.filePath),
      ),
      baselines: analysis.baselines.filter(matches),
      snapshotWarnings: analysis.snapshotWarnings.filter(matches),
      parseWarnings: analysis.parseWarnings.filter(matches),
    },
    null,
    2,
  );
}
