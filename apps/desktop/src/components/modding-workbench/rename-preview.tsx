import { useTranslation } from "react-i18next";
import type { ModdingBatchPlan } from "@/types/generated/ModdingBatchPlan";

export const RenamePreview = ({ plan }: { plan: ModdingBatchPlan }) => {
  const { t } = useTranslation();
  const usage = plan.usage;
  const byPath = new Map(usage?.files.map((file) => [file.path, file]));
  const incomplete =
    !usage?.deadlockAvailable ||
    usage.skippedAddonFiles > 0 ||
    usage.skippedDeadlockFiles > 0;
  return (
    <div className='max-h-64 space-y-2 overflow-auto rounded border p-2 text-xs'>
      {usage ? (
        <>
          <p className='text-muted-foreground'>
            {t("workbenchAuthoring.usageScanned", {
              addon: usage.scannedAddonFiles,
              deadlock: usage.scannedDeadlockFiles,
            })}
          </p>
          <p className='text-muted-foreground'>
            {t("workbenchAuthoring.usageLimit")}
          </p>
          {incomplete ? (
            <details>
              <summary className='cursor-pointer'>
                {t("workbenchAuthoring.usageIncomplete", {
                  count: usage.skippedAddonFiles + usage.skippedDeadlockFiles,
                })}
              </summary>
              {usage.diagnostics.map((message) => (
                <p key={message} className='break-all py-1'>
                  {message}
                </p>
              ))}
            </details>
          ) : null}
        </>
      ) : null}
      {plan.entries.map((entry) => {
        const found = byPath.get(entry.from);
        const referenced = found && found.addonCount + found.deadlockCount > 0;
        return (
          <div key={entry.from} className='space-y-1 border-t pt-2'>
            <p className='break-all font-mono'>
              {entry.from} → {entry.to}
            </p>
            {found && !referenced ? (
              <p className='font-medium'>
                {t(
                  incomplete
                    ? "workbenchAuthoring.usageNotFoundIncomplete"
                    : "workbenchAuthoring.usageNotFound",
                )}
              </p>
            ) : null}
            {found && referenced ? (
              <details>
                <summary className='cursor-pointer'>
                  {t("workbenchAuthoring.usageCounts", {
                    addon: found.addonCount,
                    deadlock: found.deadlockCount,
                  })}
                </summary>
                {[
                  ...found.addonReferences.map((path) => ({
                    scope: "addon",
                    path,
                  })),
                  ...found.deadlockReferences.map((path) => ({
                    scope: "deadlock",
                    path,
                  })),
                ].map(({ scope, path }) => (
                  <p
                    key={`${scope}:${path}`}
                    className='break-all py-1 font-mono'>
                    {t(`workbenchAuthoring.usageScope_${scope}`)}: {path}
                  </p>
                ))}
                <p className='text-muted-foreground'>
                  {t("workbenchAuthoring.usageExamplesLimit")}
                </p>
              </details>
            ) : null}
          </div>
        );
      })}
      {plan.referenceFiles.map((path) => (
        <p key={path}>{t("workbenchAuthoring.referenceUpdated", { path })}</p>
      ))}
      {plan.conflicts.map((conflict) => (
        <p key={conflict} role='alert' className='text-destructive'>
          {conflict}
        </p>
      ))}
    </div>
  );
};
