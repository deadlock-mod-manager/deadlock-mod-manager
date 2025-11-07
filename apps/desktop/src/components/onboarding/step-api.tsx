import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircle,
  PlugsConnected,
  WarningCircle,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { getApiHealth } from "@/lib/api";
import logger from "@/lib/logger";

type ApiStepProps = {
  onComplete: () => void;
  onError: () => void;
};

export const OnboardingStepApi = ({ onComplete, onError }: ApiStepProps) => {
  const { t } = useTranslation();

  const {
    data: health,
    isLoading,
    error,
    refetch,
  } = useQuery("api-health", getApiHealth, {
    retry: 3,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    onSuccess: (data) => {
      logger.info("API connection successful", { version: data.version });
      onComplete();
    },
    onError: (err) => {
      logger.error("Failed to connect to API", { error: err });
      onError();
    },
  });

  const checkState = isLoading ? "checking" : error ? "error" : "success";
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  return (
    <div className='space-y-6'>
      <div>
        <h3 className='text-lg font-semibold'>{t("onboarding.api.title")}</h3>
        <p className='text-sm text-muted-foreground mt-2'>
          {t("onboarding.api.description")}
        </p>
      </div>

      <div className='space-y-4'>
        {checkState === "checking" && (
          <div className='flex items-center gap-3 p-4 border rounded-lg bg-muted/50'>
            <PlugsConnected className='h-5 w-5 animate-pulse' />
            <span className='text-sm'>{t("onboarding.api.checking")}</span>
          </div>
        )}

        {checkState === "success" && health && (
          <div className='flex items-start gap-3 p-4 border rounded-lg bg-green-500/10 border-green-500/20'>
            <CheckCircle className='h-5 w-5 text-green-500 flex-shrink-0 mt-0.5' />
            <div className='flex-1'>
              <p className='text-sm font-medium text-green-500'>
                {t("onboarding.api.success")}
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                {t("onboarding.api.version")}: {health.version}
              </p>
            </div>
          </div>
        )}

        {checkState === "error" && (
          <div className='space-y-3'>
            <div className='flex items-start gap-3 p-4 border rounded-lg bg-destructive/10 border-destructive/20'>
              <WarningCircle className='h-5 w-5 text-destructive flex-shrink-0 mt-0.5' />
              <div className='flex-1'>
                <p className='text-sm font-medium text-destructive'>
                  {t("onboarding.api.error")}
                </p>
                <p className='text-xs text-muted-foreground mt-1'>
                  {t("onboarding.api.errorDescription")}
                </p>
                {errorMessage && (
                  <p className='text-xs text-muted-foreground mt-2 font-mono'>
                    {errorMessage}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant='default'
              size='sm'
              onClick={() => refetch()}
              className='w-full'>
              {t("onboarding.api.retry")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
