import { useTranslation } from "react-i18next";
import type {
  LaunchRepairFailure,
  LaunchRepairMod,
  LaunchRepairProgress,
} from "@/lib/launch-repair";

export function LaunchRepairDetails({
  mods,
  failures,
  progress,
}: {
  mods: LaunchRepairMod[];
  failures: LaunchRepairFailure[];
  progress: LaunchRepairProgress | null;
}) {
  const { t } = useTranslation();
  return (
    <div className='space-y-3 px-6 pb-6'>
      {mods.some((mod) => mod.local) && (
        <p className='text-sm text-muted-foreground'>
          {t("launchRepair.localNotice")}
        </p>
      )}
      <ul className='max-h-60 divide-y overflow-y-auto text-sm'>
        {mods.map((mod) => {
          const failure = failures.find((entry) => entry.id === mod.id);
          return (
            <li
              className='py-2'
              data-mod-id={mod.id}
              data-testid='launch-repair-mod'
              key={mod.id}>
              <div className='flex items-start justify-between gap-3'>
                <span className='break-words'>{mod.name}</span>
                {mod.local && (
                  <span className='shrink-0 text-muted-foreground'>
                    {t("launchRepair.localImport")}
                  </span>
                )}
              </div>
              {failure && (
                <p className='mt-1 text-destructive'>
                  {failure.error ?? t("launchRepair.notRestored")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div aria-live='polite'>
        {progress && (
          <p className='text-sm'>{t("launchRepair.progress", progress)}</p>
        )}
        {failures.length > 0 && (
          <p className='text-sm text-destructive' role='alert'>
            {t("launchRepair.failed")}
          </p>
        )}
      </div>
    </div>
  );
}
