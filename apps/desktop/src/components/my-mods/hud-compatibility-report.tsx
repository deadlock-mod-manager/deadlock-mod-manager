import { useTranslation } from "react-i18next";
import type { HudCheck } from "@/types/generated/HudCheck";

interface HudCompatibilityReportProps {
  expanded?: boolean;
  checks: readonly HudCheck[];
  modNames: ReadonlyMap<string, string>;
}

export function HudCompatibilityReport({
  checks,
  modNames,
  expanded = false,
}: HudCompatibilityReportProps) {
  const { t } = useTranslation();
  if (checks.length === 0) return null;
  const findings = checks.filter(
    (check) =>
      check.status !== "compared" ||
      check.missingPanels.length > 0 ||
      check.console.lines.length > 0,
  );
  const unchanged = checks.length - findings.length;
  const console = checks[0].console;

  const rows = findings.map((check) => (
    <details key={check.filePath} className='py-1'>
      <summary className='cursor-pointer'>
        {expanded
          ? check.filePath.split("/").pop()
          : (modNames.get(check.modId) ?? check.modId)}
        :{" "}
        {check.status !== "compared"
          ? t(`hudCompatibility.status.${check.status}`)
          : check.missingPanels.length > 0
            ? t("hudCompatibility.missing", {
                count: check.missingPanels.length,
              })
            : t("hudCompatibility.logMatch")}
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
      {check.console.lines.length > 0 ? (
        <div className='mt-2 space-y-1'>
          <p className='text-muted-foreground'>
            {t("hudCompatibility.logCaution")}
          </p>
          {[...new Set(check.console.lines)].map((line) => (
            <code className='block break-all' key={line}>
              {line}
            </code>
          ))}
        </div>
      ) : null}
    </details>
  ));
  if (expanded) return <div className='space-y-3'>{rows}</div>;

  return (
    <details
      open={expanded}
      className='space-y-2 rounded-md border p-3 text-xs'>
      <summary className='cursor-pointer'>
        <span className='font-medium text-sm'>
          {t("hudCompatibility.title")}
        </span>
        <span className='ml-3 text-muted-foreground'>
          {t("hudCompatibility.summary", { count: checks.length, unchanged })}
        </span>
      </summary>
      {findings.length > 0 ? (
        <p className='text-muted-foreground'>
          {t("hudCompatibility.differences")}
        </p>
      ) : null}
      {rows}
      {console.error ? (
        <p className='text-muted-foreground'>
          {t("hudCompatibility.logUnavailable")}
        </p>
      ) : null}
      <details className='text-muted-foreground'>
        <summary className='cursor-pointer'>
          {t("hudCompatibility.about")}
        </summary>
        <div className='mt-2 space-y-1'>
          <p>{t("hudCompatibility.advisory")}</p>
          {console.modifiedAt !== null ? (
            <p>
              {t("hudCompatibility.logModified", {
                date: new Date(console.modifiedAt).toLocaleString(),
              })}
            </p>
          ) : null}
          {console.truncated ? (
            <p>{t("hudCompatibility.logTruncated")}</p>
          ) : null}
          {console.error ? <p className='break-all'>{console.error}</p> : null}
          <p>{t("hudCompatibility.nextStep")}</p>
        </div>
      </details>
    </details>
  );
}
