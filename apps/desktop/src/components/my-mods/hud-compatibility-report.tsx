import { useTranslation } from "react-i18next";
import type { HudCheck } from "@/types/generated/HudCheck";

interface HudCompatibilityReportProps {
  checks: readonly HudCheck[];
  modNames: ReadonlyMap<string, string>;
}

export function HudCompatibilityReport({
  checks,
  modNames,
}: HudCompatibilityReportProps) {
  const { t } = useTranslation();
  if (checks.length === 0) return null;
  return (
    <section className='space-y-2 rounded-md border p-3 text-xs'>
      <h3 className='font-medium text-sm'>{t("hudCompatibility.title")}</h3>
      <p className='text-muted-foreground'>{t("hudCompatibility.advisory")}</p>
      {checks.map((check) => (
        <details key={check.filePath} className='rounded border p-2'>
          <summary className='cursor-pointer'>
            {modNames.get(check.modId) ?? check.modId}:{" "}
            {t(`hudCompatibility.status.${check.status}`)}
            {check.missingPanels.length > 0
              ? ` · ${t("hudCompatibility.missing", { count: check.missingPanels.length })}`
              : null}
          </summary>
          <code className='mt-2 block break-all'>{check.filePath}</code>
          <code className='block break-all text-muted-foreground'>
            {check.sourceVpk}
          </code>
          {check.detail ? <p className='mt-1'>{check.detail}</p> : null}
          {check.missingPanels.length > 0 ? (
            <p className='mt-1 break-all font-mono'>
              {check.missingPanels.join(", ")}
            </p>
          ) : null}
          <p className='mt-2 text-muted-foreground'>
            {t("hudCompatibility.logCaution")}
          </p>
          {check.console.modifiedAt !== null ? (
            <p>
              {t("hudCompatibility.logModified", {
                date: new Date(check.console.modifiedAt).toLocaleString(),
              })}
            </p>
          ) : null}
          {check.console.truncated ? (
            <p>{t("hudCompatibility.logTruncated")}</p>
          ) : null}
          {check.console.error ? (
            <p>
              {t("hudCompatibility.logUnavailable")} {check.console.error}
            </p>
          ) : null}
          {check.console.lines.length === 0 ? (
            <p>{t("hudCompatibility.noEvidence")}</p>
          ) : (
            [...new Set(check.console.lines)].map((line) => (
              <code className='block break-all' key={line}>
                {line}
              </code>
            ))
          )}
          <p className='mt-2 text-muted-foreground'>
            {t("hudCompatibility.nextStep")}
          </p>
        </details>
      ))}
    </section>
  );
}
