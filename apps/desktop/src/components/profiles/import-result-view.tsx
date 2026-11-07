import { Button } from "@deadlock-mods/ui/components/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { useTranslation } from "react-i18next";
import { IMPORT_FAILURE_REASON_KEYS } from "@/lib/profiles/import-failures";
import type { ProfileImportOutcome } from "@/lib/profiles/types";

interface ImportResultViewProps {
  outcome: ProfileImportOutcome;
  onDone: () => void;
}

/** Takes over an import or restore dialog when some mods weren't imported. */
export const ImportResultView = ({
  outcome,
  onDone,
}: ImportResultViewProps) => {
  const { t } = useTranslation();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("profiles.importResult.title")}</DialogTitle>
        <DialogDescription>
          {t("profiles.importResult.summary", {
            imported: outcome.importedCount,
            total: outcome.totalCount,
            profileName: outcome.profileName,
          })}
        </DialogDescription>
      </DialogHeader>
      <section className='space-y-2'>
        <h3 className='text-sm font-medium'>
          {t("profiles.importResult.notImported", {
            count: outcome.failures.length,
          })}
        </h3>
        <ul className='max-h-64 divide-y overflow-y-auto rounded-md border'>
          {outcome.failures.map(({ remoteId, name, step }) => (
            <li className='space-y-0.5 px-3 py-2' key={remoteId}>
              <p className='break-words text-sm'>
                {name ?? t("profiles.importFailures.unnamed", { remoteId })}
              </p>
              <p className='text-xs text-muted-foreground'>
                {t(IMPORT_FAILURE_REASON_KEYS[step])}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <DialogFooter>
        <Button autoFocus onClick={onDone}>
          {t("profiles.importResult.done")}
        </Button>
      </DialogFooter>
    </>
  );
};
