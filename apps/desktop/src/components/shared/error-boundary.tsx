import { type ErrorCategory, formatUserError } from "@/lib/format-error";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  CloudSlashIcon,
  LockIcon,
  WarningIcon,
  WifiSlashIcon,
} from "@phosphor-icons/react";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import {
  type FallbackProps,
  ErrorBoundary as ReactErrorBoundary,
} from "react-error-boundary";
import { useTranslation } from "react-i18next";

const STATUS_PAGE_URL = "https://status.deadlockmods.app";

const StatusPageLink = () => (
  <button
    className='text-primary underline underline-offset-4 hover:text-primary/80'
    onClick={() => openUrl(STATUS_PAGE_URL)}
    type='button'>
    status.deadlockmods.app
  </button>
);

const renderDescription = (description: string) => {
  if (!description) return null;
  const parts = description.split("status.deadlockmods.app");
  if (parts.length === 1) return description;

  return parts.map((part, index) => (
    <span key={part}>
      {part}
      {index < parts.length - 1 && <StatusPageLink />}
    </span>
  ));
};

const CATEGORY_ICONS: Record<ErrorCategory, ReactNode> = {
  connection: <WifiSlashIcon className='size-12' weight='duotone' />,
  server: <CloudSlashIcon className='size-12' weight='duotone' />,
  "rate-limit": <WarningIcon className='size-12' weight='duotone' />,
  auth: <LockIcon className='size-12' weight='duotone' />,
  "not-found": <WarningIcon className='size-12' weight='duotone' />,
  "game-config": <WarningIcon className='size-12' weight='duotone' />,
  unknown: <WarningIcon className='size-12' weight='duotone' />,
};

const FallbackComponent = ({ error, resetErrorBoundary }: FallbackProps) => {
  const { t } = useTranslation();
  const userError = formatUserError(error);

  return (
    <Empty className='h-full min-h-0 flex-1'>
      <EmptyHeader>
        <EmptyMedia variant='default'>
          {CATEGORY_ICONS[userError.category]}
        </EmptyMedia>
        <EmptyTitle>{userError.title}</EmptyTitle>
        <EmptyDescription>
          {renderDescription(userError.description)}
        </EmptyDescription>
      </EmptyHeader>

      {userError.category === "game-config" && (
        <div className='flex max-w-sm flex-col gap-2 text-sm'>
          <p>{t("errors.failedToParseGameConfiguration.instruction")}</p>
          <ol className='list-inside list-decimal text-muted-foreground'>
            {(
              t("errors.failedToParseGameConfiguration.steps", {
                returnObjects: true,
              }) as string[]
            ).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      <EmptyContent>
        <div className='flex gap-3'>
          <Button
            onClick={resetErrorBoundary}
            icon={<ArrowClockwiseIcon className='h-4 w-4' />}>
            {t("errors.tryAgain")}
          </Button>
          <Button
            onClick={() => globalThis.history.back()}
            variant='outline'
            icon={<ArrowLeftIcon className='h-4 w-4' />}>
            {t("errors.goBack")}
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
};

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const { reset } = useQueryErrorResetBoundary();

  return (
    <ReactErrorBoundary onReset={reset} FallbackComponent={FallbackComponent}>
      {children}
    </ReactErrorBoundary>
  );
};

export default ErrorBoundary;
