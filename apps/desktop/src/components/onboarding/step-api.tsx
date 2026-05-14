import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircleIcon,
  PlugsConnectedIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getApiHealth } from "@/lib/api-client";
import logger from "@/lib/logger";

type ApiStepProps = {
  onComplete: () => void;
  onError: () => void;
};

export const OnboardingStepApi = ({ onComplete, onError }: ApiStepProps) => {
  const { t } = useTranslation();

  const {
    data: health,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["api-health"],
    queryFn: getApiHealth,
    retry: 3,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (health) {
      logger
        .withMetadata({ version: health.version })
        .info("API connection successful");
      onComplete();
    }
  }, [health, onComplete]);

  useEffect(() => {
    if (error) {
      logger.withError(error).error("Failed to connect to API");
      onError();
    }
  }, [error, onError]);

  const getCheckState = (): "checking" | "error" | "success" => {
    if (isPending) return "checking";
    if (error) return "error";
    return "success";
  };

  const checkState = getCheckState();
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  return (
    <div className='space-y-5'>
      <div>
        <h3 className='font-["Forevs_Demo"] text-lg tracking-wide'>
          {t("onboarding.api.title")}
        </h3>
        <p className='mt-2 text-sm text-muted-foreground'>
          {t("onboarding.api.description")}
        </p>
      </div>

      <div className='space-y-3'>
        {checkState === "checking" && (
          <div className='flex items-center gap-4 rounded-lg border border-border/50 bg-muted/30 p-4'>
            <div className='relative flex size-8 items-center justify-center'>
              <div className='onboarding-pulse-ring absolute inset-0 rounded-full border border-primary/50' />
              <div className='onboarding-pulse-ring-delayed absolute inset-0 rounded-full border border-primary/30' />
              <PlugsConnectedIcon className='relative size-4 text-primary' />
            </div>
            <span className='text-sm'>{t("onboarding.api.checking")}</span>
          </div>
        )}

        {checkState === "success" && health && (
          <div className='rounded-lg border border-green-500/20 bg-green-500/8 p-4'>
            <div className='flex items-center gap-2'>
              <CheckCircleIcon
                weight='duotone'
                className='size-5 shrink-0 text-green-500'
              />
              <p className='text-sm font-medium text-green-500'>
                {t("onboarding.api.success")}
              </p>
            </div>
            <p className='mt-1 pl-7 text-xs text-muted-foreground'>
              {t("onboarding.api.version")}: {health.version}
            </p>
          </div>
        )}

        {checkState === "error" && (
          <div className='space-y-3'>
            <div className='rounded-lg border border-destructive/20 bg-destructive/8 p-4'>
              <div className='flex items-center gap-2'>
                <WarningCircleIcon
                  weight='duotone'
                  className='size-5 shrink-0 text-destructive'
                />
                <p className='text-sm font-medium text-destructive'>
                  {t("onboarding.api.error")}
                </p>
              </div>
              <p className='mt-1 pl-7 text-xs text-muted-foreground'>
                {t("onboarding.api.errorDescription")}
              </p>
              {errorMessage && (
                <p className='mt-2 pl-7 font-mono text-xs text-muted-foreground/70'>
                  {errorMessage}
                </p>
              )}
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
