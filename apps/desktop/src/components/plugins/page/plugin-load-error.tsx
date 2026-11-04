import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import { PageButton } from "./page-button";

export const PluginLoadError = ({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div
      className='flex h-full flex-col items-center justify-center gap-3 p-6'
      role='alert'>
      <p>
        {t("plugins.manage.loadFailed", { message: getErrorMessage(error) })}
      </p>
      <PageButton onClick={onRetry} variant='outline'>
        {t("common.retry")}
      </PageButton>
    </div>
  );
};
