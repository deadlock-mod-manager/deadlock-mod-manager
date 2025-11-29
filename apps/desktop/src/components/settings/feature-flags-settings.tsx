import type { FeatureFlag } from "@deadlock-mods/shared";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import {
  useFeatureFlagMutation,
  useFeatureFlags,
} from "@/hooks/use-feature-flags";

export const FeatureFlagsSettings = () => {
  const { t } = useTranslation();
  const { data: featureFlags, isLoading } = useFeatureFlags();
  const { toggleFlag } = useFeatureFlagMutation();
  const { session } = useAuth();

  const exposedFlags =
    featureFlags?.filter((flag: FeatureFlag) => flag.exposed) ?? [];

  if (!session) {
    return (
      <div className='rounded-lg border border-border bg-card p-4'>
        <p className='text-muted-foreground text-sm'>
          {t("featureFlags.loginRequired")}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className='space-y-4'>
        {[...Array(3)].map((_) => (
          <div
            className='h-16 animate-pulse rounded-lg bg-muted'
            key={crypto.randomUUID()}
          />
        ))}
      </div>
    );
  }

  if (exposedFlags.length === 0) {
    return (
      <div className='rounded-lg border border-border bg-card p-4'>
        <p className='text-muted-foreground text-sm'>
          {t("featureFlags.noExposedFlags")}
        </p>
      </div>
    );
  }

  const handleToggle = async (flag: FeatureFlag) => {
    if (flag.type !== "boolean") {
      toast.error(t("featureFlags.onlyBooleanToggles"));
      return;
    }

    try {
      await toggleFlag(flag.id, flag.value);
      toast.success(
        t("featureFlags.toggleSuccess", {
          name: flag.name,
          state: flag.value ? t("common.off") : t("common.on"),
        }),
      );
    } catch (error) {
      toast.error(t("featureFlags.toggleError"));
    }
  };

  return (
    <div className='space-y-4'>
      {exposedFlags.map((flag: FeatureFlag) => (
        <div
          className='flex items-center justify-between rounded-lg border border-border bg-card p-4'
          key={flag.id}>
          <div className='flex-1 space-y-1'>
            <Label className='font-semibold text-sm' htmlFor={flag.id}>
              {flag.name}
            </Label>
            {flag.description && (
              <p className='text-muted-foreground text-sm'>
                {flag.description}
              </p>
            )}
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground text-xs'>
                {t("common.type")}: {flag.type}
              </span>
              {flag.type === "boolean" && (
                <span className='text-muted-foreground text-xs'>
                  • {t("common.currentValue")}:{" "}
                  {flag.value ? t("common.enabled") : t("common.disabled")}
                </span>
              )}
            </div>
          </div>
          {flag.type === "boolean" && (
            <Switch
              checked={Boolean(flag.value)}
              id={flag.id}
              onCheckedChange={() => handleToggle(flag)}
            />
          )}
          {flag.type !== "boolean" && (
            <span className='text-muted-foreground text-xs'>
              {t("featureFlags.nonBooleanFlag")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
