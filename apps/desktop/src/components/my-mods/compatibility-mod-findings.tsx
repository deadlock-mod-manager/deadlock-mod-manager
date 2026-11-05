import { CopyCompatibilityFindings } from "./copy-compatibility-findings";
import { CompatibilityModRow } from "./compatibility-mod-row";
import { useTranslation } from "react-i18next";
import type { HudCheck } from "@/types/generated/HudCheck";
import type { AssetWarning } from "./asset-compatibility-report";
import type { DataWarning } from "./data-compatibility-report";
import { CompatibilityWarnings } from "./compatibility-findings";
import type { LocalizationOverlayAnalysis } from "./localization-conflict-review";
import { HudCompatibilityReport } from "./hud-compatibility-report";

interface CompatibilityModFindingsProps {
  analysis: LocalizationOverlayAnalysis;
  assetWarnings: readonly AssetWarning[];
  dataWarnings: readonly DataWarning[];
  checks: readonly HudCheck[];
  modNames: ReadonlyMap<string, string>;
}

export function CompatibilityModFindings({
  analysis,
  assetWarnings,
  dataWarnings,
  checks,
  modNames,
}: CompatibilityModFindingsProps) {
  const { t } = useTranslation();
  const hudFindings = checks.filter(
    (check) =>
      check.status !== "compared" ||
      check.missingPanels.length > 0 ||
      check.console.lines.length > 0,
  );
  const modIds = new Set(
    [...assetWarnings, ...dataWarnings, ...hudFindings].map(
      (finding) => finding.modId,
    ),
  );
  for (const resource of analysis.protectedResources)
    for (const modId of resource.modIds) modIds.add(modId);
  for (const warning of [...analysis.inputWarnings, ...analysis.unmanagedVpks])
    modIds.add(warning.modId);
  return (
    <div className='space-y-1'>
      {[...modIds].map((modId) => {
        const assets = assetWarnings.filter(
          (warning) => warning.modId === modId,
        );
        const data = dataWarnings.filter((warning) => warning.modId === modId);
        const hud = hudFindings.filter((check) => check.modId === modId);
        const differences = hud.filter(
          (check) => check.status === "compared",
        ).length;
        const incomplete = hud.length - differences;
        const shared = analysis.protectedResources.filter((resource) =>
          resource.modIds.includes(modId),
        );
        const missing = analysis.inputWarnings.filter(
          (warning) => warning.modId === modId,
        );
        const unmanaged = analysis.unmanagedVpks.filter(
          (archive) => archive.modId === modId,
        );
        const labels = [
          shared.length > 0
            ? t("myMods.compatibility.sharedFiles", { count: shared.length })
            : "",
          missing.length > 0 ? t("myMods.compatibility.missingFilesTitle") : "",
          unmanaged.length > 0
            ? t("myMods.compatibility.unmanagedFilesTitle")
            : "",
          assets.length + data.length > 0
            ? t("myMods.compatibility.resourceFindings", {
                count: assets.length + data.length,
              })
            : "",
          differences > 0
            ? t("myMods.compatibility.layoutDifferences", {
                count: differences,
              })
            : "",
          incomplete > 0
            ? t("myMods.compatibility.uncheckedLayouts", { count: incomplete })
            : "",
        ].filter(Boolean);
        return (
          <CompatibilityModRow
            key={modId}
            modId={modId}
            name={modNames.get(modId) ?? modId}
            labels={labels}>
            <div className='space-y-4'>
              <CopyCompatibilityFindings
                analysis={analysis}
                modNames={modNames}
                modId={modId}
              />
              {analysis.excludedModIds.includes(modId) ? (
                <p className='text-muted-foreground'>
                  {t("myMods.compatibility.usingOriginalFiles")}
                </p>
              ) : null}
              {shared.length > 0 ? (
                <section className='space-y-2'>
                  <p className='font-medium'>
                    {t("myMods.compatibility.sharedTitle")}
                  </p>
                  <p className='text-muted-foreground leading-relaxed'>
                    {t("myMods.compatibility.sharedDescription")}
                  </p>
                  <ul className='space-y-2 text-muted-foreground'>
                    {shared.map((resource) => (
                      <li key={resource.filePath}>
                        <code className='break-all'>{resource.filePath}</code>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {missing.length > 0 ? (
                <section className='space-y-2'>
                  <p>{t("myMods.compatibility.missingFilesDescription")}</p>
                  {missing
                    .flatMap((warning) => warning.filePaths)
                    .map((path) => (
                      <code
                        key={path}
                        className='block break-all text-muted-foreground'>
                        {path}
                      </code>
                    ))}
                </section>
              ) : null}
              {unmanaged.length > 0 ? (
                <section className='space-y-2'>
                  <p>{t("myMods.compatibility.unmanagedFilesDescription")}</p>
                  {unmanaged.map((archive) => (
                    <code
                      key={archive.filePath}
                      className='block break-all text-muted-foreground'>
                      {archive.filePath}
                    </code>
                  ))}
                </section>
              ) : null}
              <CompatibilityWarnings
                embedded
                assetWarnings={assets}
                dataWarnings={data}
                modNames={modNames}
              />
              <HudCompatibilityReport
                expanded
                checks={checks.filter((check) => check.modId === modId)}
                modNames={modNames}
              />
            </div>
          </CompatibilityModRow>
        );
      })}
    </div>
  );
}
