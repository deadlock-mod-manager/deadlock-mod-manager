import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import type { ModdingRepairBackup } from "@/types/generated/ModdingRepairBackup";

interface Props {
  backups: ModdingRepairBackup[];
  disabled: boolean;
  restoring: string | undefined;
  onRestore: (id: string) => void;
}

export function RepairBackups({
  backups,
  disabled,
  restoring,
  onRestore,
}: Props) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("workbenchRepair.backups")} className='border-t'>
      <details>
        <summary className='cursor-pointer px-4 py-3 text-sm font-medium'>
          {t("workbenchRepair.backupCount", { count: backups.length })}
        </summary>
        <p className='px-4 pb-3 text-xs text-muted-foreground'>
          {t("workbenchRepair.restoreDescription")}
        </p>
        <ul className='divide-y'>
          {backups.map((backup) => (
            <li key={backup.id} className='flex items-start gap-3 px-4 py-3'>
              <div className='min-w-0 flex-1'>
                <time className='text-xs' dateTime={backup.createdAt}>
                  {new Date(backup.createdAt).toLocaleString()}
                </time>
                <p className='break-all font-mono text-[11px] text-muted-foreground'>
                  {backup.id}
                </p>
                <details className='mt-1 text-xs text-muted-foreground'>
                  <summary className='cursor-pointer'>
                    {t("workbenchRepair.affectedFiles", {
                      count: backup.files.length,
                    })}
                  </summary>
                  <ul className='mt-1'>
                    {backup.files.map((file) => (
                      <li key={file} className='break-all font-mono'>
                        {file}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
              <Button
                size='sm'
                variant='outline'
                disabled={disabled || backup.restored}
                onClick={() => onRestore(backup.id)}>
                {t(
                  backup.restored
                    ? "workbenchRepair.restored"
                    : restoring === backup.id
                      ? "workbenchRepair.restoring"
                      : "workbenchRepair.restore",
                )}
              </Button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
