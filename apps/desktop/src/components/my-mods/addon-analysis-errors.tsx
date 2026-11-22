import { AlertTriangle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export const ErrorsList = ({ errors }: { errors: string[] }) => {
  const { t } = useTranslation();

  if (errors.length === 0) return null;

  // The same message can repeat (a file name in two shards), so number repeats.
  const seen = new Map<string, number>();
  const rows = errors.map((error) => {
    const occurrence = (seen.get(error) ?? 0) + 1;
    seen.set(error, occurrence);
    return { error, key: `${occurrence}:${error}` };
  });

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <AlertTriangle className='w-4 h-4 text-amber-500' />
        <h3 className='font-medium text-sm'>
          {t("addons.errors")} ({errors.length})
        </h3>
      </div>
      <div className='space-y-2'>
        {rows.map(({ error, key }) => (
          <div
            key={key}
            data-analysis-error
            className='p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md'>
            <p className='text-sm text-amber-800 dark:text-amber-200'>
              {error}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
