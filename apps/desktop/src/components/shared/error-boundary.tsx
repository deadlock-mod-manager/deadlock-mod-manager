import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { WarningIcon } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import {
  type FallbackProps,
  ErrorBoundary as ReactErrorBoundary,
} from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { openGameInfoFolder } from "@/lib/api";

const FallbackComponent = ({ error, resetErrorBoundary }: FallbackProps) => {
  const { t } = useTranslation();

  const isGameConfigError = error?.message?.includes(
    "Failed to parse game configuration",
  );

  return (
    <Alert>
      <WarningIcon className='h-6 w-6' />
      <AlertDescription className='flex flex-grow flex-row items-center justify-between gap-2'>
        <div className='flex flex-col gap-2'>
          <p>{t("errors.genericMessage")}</p>
          {isGameConfigError && (
            <div className='flex flex-col gap-2'>
              <p>{t("errors.failedToParseGameConfiguration.instruction")}</p>
              <ol className='list-decimal list-inside'>
                {(
                  t("errors.failedToParseGameConfiguration.steps", {
                    returnObjects: true,
                  }) as string[]
                ).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className='font-medium'>
                Your addons folder or gameinfo.gi may be marked as read-only.
                Uncheck it in File Explorer → Properties.
              </p>
              <video
                src='/read-only-tutorial.mp4'
                className='rounded-md max-w-sm'
                autoPlay
                loop
                muted
                playsInline
              />
              <div className='flex flex-row gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    invoke("open_mods_folder", { profileFolder: null })
                  }>
                  Open Addons Folder
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => openGameInfoFolder()}>
                  Open Gameinfo Folder
                </Button>
              </div>
            </div>
          )}
          <pre>
            {t("errors.errorCode")} {error?.message ?? String(error)}
          </pre>
        </div>
        <div className='flex flex-col items-center justify-center gap-2'>
          <Button onClick={resetErrorBoundary}>{t("errors.tryAgain")}</Button>
          <Button onClick={() => globalThis.history.back()} variant='ghost'>
            {t("errors.goBack")}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  return (
    <ReactErrorBoundary FallbackComponent={FallbackComponent}>
      {children}
    </ReactErrorBoundary>
  );
};

export default ErrorBoundary;
