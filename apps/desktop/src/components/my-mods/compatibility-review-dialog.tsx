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
}

export function CompatibilityReviewDialog({
  open,
  onOpenChange,
  profileFolder,
  enabled,
  gameRunning,
}: CompatibilityReviewDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mods = usePersistedStore((state) => state.localMods);
  const [choices, setChoices] = useState<Record<string, LocalizationChoice>>(
    {},
  );
  const analysis = useQuery({
    queryKey: ["mod-compatibility-analysis", profileFolder],
    queryFn: () =>
      invoke<LocalizationOverlayAnalysis>("analyze_localization_overlay", {
        profileFolder,
      }),
    enabled: open,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const apply = useMutation({
    mutationFn: async () => {
      if (!analysis.data) return;
      if (!enabled) {
        await invoke<void>("set_mod_compatibility_enabled", {
          enabled: true,
          profileFolder,
        });
      }
      return invoke<LocalizationOverlayApplyResult>(
        "apply_localization_overlay",
        {
          profileFolder,
          resolutions: compatibilityResolutions(analysis.data, choices),
        },
      );
    },
    onSuccess: () => {
      toast.success(t("myMods.compatibility.applied"));
      setChoices({});
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(t("modOrdering.localization.applyFailed"), {
        description: getErrorMessage(error),
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: MOD_COMPATIBILITY_QUERY_KEY }),
  });
  const modNames = new Map(mods.map((mod) => [mod.remoteId, mod.name]));
  const changeOpen = (next: boolean) => {
    if (apply.isPending) return;
    if (!next) setChoices({});
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className='flex max-h-[82vh] max-w-2xl flex-col overflow-hidden'>
        <DialogHeader className='shrink-0 pr-8'>
          <DialogTitle>{t("myMods.compatibility.review")}</DialogTitle>
          <DialogDescription>
            {t("myMods.compatibility.reviewDescription")}
          </DialogDescription>
          {gameRunning ? (
            <p className='text-muted-foreground text-sm'>
              {t("myMods.compatibility.closeGame")}
            </p>
          ) : null}
        </DialogHeader>
        {analysis.isFetching ? (
          <div
            role='status'
            className='flex items-center gap-2 py-8 text-muted-foreground text-sm'>
            <Loader2 aria-hidden className='size-4 animate-spin' />
            {t("myMods.compatibility.checking")}
          </div>
        ) : analysis.isError ? (
          <div role='alert' className='space-y-3 py-4 text-sm'>
            <p>{t("myMods.compatibility.checkFailed")}</p>
            <p className='text-muted-foreground'>
              {getErrorMessage(analysis.error)}
            </p>
            <Button variant='outline' onClick={() => analysis.refetch()}>
              {t("myMods.compatibility.retry")}
            </Button>
          </div>
        ) : analysis.data ? (
          <LocalizationConflictReview
            analysis={analysis.data}
            choices={choices}
            modNames={modNames}
            onChoiceChange={(key, choice) =>
              setChoices((current) => ({ ...current, [key]: choice }))
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
              !analysis.data ||
              analysis.isFetching ||
              analysis.isError ||
              apply.isPending ||
              gameRunning
            }
            onClick={() => apply.mutate()}>
            {apply.isPending ? (
              <Loader2 aria-hidden className='size-4 animate-spin' />
            ) : null}
            {enabled
              ? t("myMods.compatibility.apply")
              : t("myMods.compatibility.enableAndApply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
