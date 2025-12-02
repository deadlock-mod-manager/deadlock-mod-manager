import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Warning } from "@phosphor-icons/react";
import {
  type FallbackProps,
  ErrorBoundary as ReactErrorBoundary,
} from "react-error-boundary";
import { useTranslation } from "react-i18next";

const fallbackRender = ({ error, resetErrorBoundary }: FallbackProps) => {
  const { t } = useTranslation();

  return (
    <Alert>
      <Warning className='h-6 w-6' />
      <AlertDescription className='flex flex-grow flex-row items-center justify-between gap-2'>
        <div className='flex flex-col gap-2'>
          <p>{t("errors.genericMessage")}</p>
          {error.message.includes("Failed to parse game configuration") && (
            <div className="flex flex-col gap-2">
              <p>{t("errors.failedToParseGameConfiguration.instruction")}</p>
              <ol className="list-decimal list-inside">
                <li>{t("errors.failedToParseGameConfiguration.step1")}</li>
                <li>{t("errors.failedToParseGameConfiguration.step2")}</li>
              </ol>
            </div>
          )}
          <pre>
            {t("errors.errorCode")} {error.message}
          </pre>
        </div>
        <div className='flex flex-col items-center justify-center gap-2'>
          <Button onClick={resetErrorBoundary}>{t("errors.tryAgain")}</Button>
          <Button onClick={() => window.history.back()} variant='ghost'>
            {t("errors.goBack")}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  return (
    <ReactErrorBoundary fallbackRender={fallbackRender}>
      {children}
    </ReactErrorBoundary>
  );
};

export default ErrorBoundary;
