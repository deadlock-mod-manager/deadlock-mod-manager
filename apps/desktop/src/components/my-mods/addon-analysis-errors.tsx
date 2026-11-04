import { AlertTriangle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export const ErrorsList = ({ errors }: { errors: string[] }) => {
  const { t } = useTranslation();

  if (errors.length === 0) return null;

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <AlertTriangle className='w-4 h-4 text-amber-500' />
        <h3 className='font-medium text-sm'>
          {t("addons.errors")} ({errors.length})
        </h3>
      </div>
      <div className='space-y-2'>
        {errors.map((error) => (
          <div
            key={error.slice(0, 50)}
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
