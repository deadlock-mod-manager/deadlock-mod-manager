import { Button } from "@deadlock-mods/ui/components/button";
import { AlertCircle } from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import type { BatchUpdateFailure } from "@/lib/mods/batch-update-failures";
import { resolveUpdateFailures } from "@/lib/mods/batch-update-failures";
import type { BatchUpdateResult } from "@/types/mods";

interface BatchUpdateFailureDetailsProps {
  failure?: BatchUpdateFailure;
  result?: BatchUpdateResult;
  mods: { remoteId: string; name: string }[];
}

export function BatchUpdateFailureDetails({
  failure,
  result,
  mods,
}: BatchUpdateFailureDetailsProps) {
  const { t } = useTranslation();
  const failures = resolveUpdateFailures(result?.failed ?? [], mods);
  const ownership = failure?.ownership;
  const diagnostics = JSON.stringify(
    { failure, result, failedMods: failures },
    null,
    2,
  );
  const copy = useMutation({
    mutationFn: () => writeText(diagnostics),
    meta: { skipGlobalErrorHandler: true },
  });

  let title = t("myMods.batchUpdate.error");
  let description = t("myMods.batchUpdate.failureDescription");
  if (failure?.kind === "backupCreationFailed") {
    title = t("myMods.batchUpdate.backupFailedTitle");
    description = t("myMods.batchUpdate.backupFailedDescription");
  }
  if (result) {
    description = t("myMods.batchUpdate.partialSuccess", {
      succeeded: result.succeeded.length,
      failed: result.failed.length,
    });
  }
  if (ownership) {
    title = t("myMods.batchUpdate.ownershipTitle");
    description = t("myMods.batchUpdate.ownershipDescription", {
      mods: ownership.mods.map((mod) => mod.name).join(", "),
      path: ownership.path,
      profile: ownership.profileName || t("myMods.batchUpdate.defaultProfile"),
    });
  }

  return (
    <div
      className='space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm'
      data-testid='batch-update-failure'>
      <div className='flex items-start gap-2' role='alert'>
        <AlertCircle
          className='mt-0.5 size-4 shrink-0 text-destructive'
          aria-hidden='true'
        />
        <div className='min-w-0 space-y-1'>
          <p className='font-semibold'>{title}</p>
          <p className='text-muted-foreground'>{description}</p>
        </div>
      </div>
      {ownership && (
        <>
          <ul className='divide-y border-y'>
            {ownership.mods.map((mod) => (
              <li className='break-words py-2' key={mod.id}>
                {mod.name}{" "}
                <span className='text-xs text-muted-foreground'>
                  ({mod.id})
                </span>
              </li>
            ))}
          </ul>
          <p className='text-muted-foreground'>
            {t("myMods.batchUpdate.ownershipGuidance")}
          </p>
        </>
      )}
      {failures.length > 0 && (
        <ul className='max-h-60 divide-y overflow-y-auto border-y'>
          {failures.map((mod) => (
            <li className='space-y-1 py-2' key={mod.id}>
              <p className='break-words font-medium'>{mod.name}</p>
              <p className='whitespace-pre-wrap break-words text-muted-foreground'>
                {mod.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary className='cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
          {t("myMods.batchUpdate.technicalDetails")}
        </summary>
        <pre className='mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground'>
          {diagnostics}
        </pre>
      </details>
      <div className='flex flex-wrap items-center gap-3'>
        <Button
          size='sm'
          variant='outline'
          onClick={() => copy.mutate()}
          disabled={copy.isPending}>
          {t(
            copy.isSuccess
              ? "myMods.batchUpdate.detailsCopied"
              : "myMods.batchUpdate.copyDetails",
          )}
        </Button>
        {copy.isError && (
          <p role='alert' className='text-destructive'>
            {t("myMods.batchUpdate.copyDetailsFailed")}
          </p>
        )}
      </div>
    </div>
  );
}
