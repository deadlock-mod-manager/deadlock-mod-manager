import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Loader2 } from "@deadlock-mods/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MOD_COMPATIBILITY_QUERY_KEY } from "@/hooks/use-mod-compatibility";
import { getErrorMessage } from "@/lib/errors";
import {
  compatibilityResolutions,
  type LocalizationOverlayApplyResult,
} from "@/lib/mods/compatibility";
import { usePersistedStore } from "@/lib/store";
import {
  type LocalizationChoice,
  LocalizationConflictReview,
  type LocalizationOverlayAnalysis,
} from "./localization-conflict-review";

interface CompatibilityReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileFolder: string | null;
  enabled: boolean;
  gameRunning: boolean;
  launchAfterApply?: boolean;
  onApplied?: () => void;
}

export function CompatibilityReviewDialog({
  open,
  onOpenChange,
  profileFolder,
  enabled,
  gameRunning,
  launchAfterApply = false,
  onApplied,
}: CompatibilityReviewDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mods = usePersistedStore((state) => state.localMods);
  const inputs = mods.map((mod) => ({
    id: mod.remoteId,
    status: mod.status,
    vpks: mod.installedVpks,
    order: mod.installOrder,
  }));
  const analysis = useQuery({
    queryKey: ["mod-compatibility-analysis", profileFolder, inputs],
    queryFn: () =>
      invoke<LocalizationOverlayAnalysis>("analyze_localization_overlay", {
        profileFolder,
      }),
    enabled: open,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const scope = JSON.stringify([
    profileFolder,
    inputs,
    analysis.data?.reviewFingerprint,
  ]);
  const [selection, setSelection] = useState<{
    scope: string;
    choices: Record<string, LocalizationChoice>;
  }>({ scope, choices: {} });
  const choices = selection.scope === scope ? selection.choices : {};
  const resolutions = analysis.data
    ? compatibilityResolutions(analysis.data, choices)
    : [];
  const resolvedAnalysis = useQuery({
    queryKey: [
      "mod-compatibility-resolved-analysis",
      profileFolder,
      inputs,
      analysis.dataUpdatedAt,
      resolutions,
    ],
    queryFn: () =>
      invoke<LocalizationOverlayAnalysis>("analyze_localization_overlay", {
        profileFolder,
        resolutions,
      }),
    enabled: open && !!analysis.data && resolutions.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const review = resolutions.length > 0 ? resolvedAnalysis : analysis;
  const apply = useMutation({
    mutationFn: async () => {
      if (!review.data) return;
      return invoke<LocalizationOverlayApplyResult>(
        "apply_localization_overlay",
        {
          profileFolder,
          expectedFingerprint: review.data.reviewFingerprint,
          resolutions: compatibilityResolutions(review.data, choices),
        },
      );
    },
    onSuccess: () => {
      toast.success(t("myMods.compatibility.applied"));
      setSelection({ scope, choices: {} });
      onApplied?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(t("modOrdering.localization.applyFailed"), {
        description: getErrorMessage(error),
      });
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: MOD_COMPATIBILITY_QUERY_KEY,
        }),
        queryClient.invalidateQueries({
          queryKey: ["mod-compatibility-analysis"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["mod-compatibility-resolved-analysis"],
        }),
      ]),
  });
  const modNames = new Map(mods.map((mod) => [mod.remoteId, mod.name]));
  const changeOpen = (next: boolean) => {
    if (apply.isPending) return;
    if (!next) setSelection({ scope, choices: {} });
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className='flex max-h-[82vh] max-w-2xl flex-col overflow-hidden'>
        <DialogHeader className='shrink-0 pr-8'>
          <DialogTitle>{t("myMods.compatibility.review")}</DialogTitle>
          <DialogDescription>
            {t(
              launchAfterApply
                ? "myMods.compatibility.launchReviewDescription"
                : "myMods.compatibility.reviewDescription",
            )}
          </DialogDescription>
          {gameRunning ? (
            <p className='text-muted-foreground text-sm'>
              {t("myMods.compatibility.closeGame")}
            </p>
          ) : null}
        </DialogHeader>
        {analysis.isFetching || review.isFetching ? (
          <div
            role='status'
            className='flex items-center gap-2 py-8 text-muted-foreground text-sm'>
            <Loader2 aria-hidden className='size-4 animate-spin' />
            {t("myMods.compatibility.checking")}
          </div>
        ) : analysis.isError || review.isError ? (
          <div role='alert' className='space-y-3 py-4 text-sm'>
            <p>{t("myMods.compatibility.checkFailed")}</p>
            <p className='text-muted-foreground'>
              {getErrorMessage(analysis.error ?? review.error)}
            </p>
            <Button
              variant='outline'
              onClick={() =>
                analysis.isError ? analysis.refetch() : review.refetch()
              }>
              {t("myMods.compatibility.retry")}
            </Button>
          </div>
        ) : review.data ? (
          <LocalizationConflictReview
            analysis={review.data}
            choices={choices}
            modNames={modNames}
            onChoiceChange={(key, choice) =>
              setSelection({ scope, choices: { ...choices, [key]: choice } })
            }
          />
        ) : null}
        <DialogFooter className='shrink-0 border-t pt-4'>
          <Button
            variant='outline'
            disabled={apply.isPending}
            onClick={() => changeOpen(false)}>
            {t("common.close")}
          </Button>
          <Button
            disabled={
              !enabled ||
              !review.data ||
              analysis.isFetching ||
              analysis.isError ||
              review.isFetching ||
              review.isError ||
              apply.isPending ||
              gameRunning
            }
            onClick={() => apply.mutate()}>
            {apply.isPending ? (
              <Loader2 aria-hidden className='size-4 animate-spin' />
            ) : null}
            {t(
              launchAfterApply
                ? "myMods.compatibility.applyAndLaunch"
                : "myMods.compatibility.apply",
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
