import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { RefreshCw, ShieldCheck } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModCompatibilityController } from "@/hooks/use-mod-compatibility";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import { CompatibilityReviewDialog } from "./compatibility-review-dialog";

export function ModCompatibilityControl({
  profileFolder,
  hasMods,
  compatibility,
}: {
  profileFolder: string | null;
  hasMods: boolean;
  compatibility: ModCompatibilityController;
}) {
  const { t } = useTranslation();
  const { preference, game, pendingChanges, gamePath } = compatibility;
  const mods = usePersistedStore((state) => state.localMods);
  const [reviewOpen, setReviewOpen] = useState(false);
  const count = mods.filter(
    (mod) =>
      mod.status === ModStatus.Installed && preference.data?.[mod.remoteId],
  ).length;

  if (preference.isError || game.isError) {
    return (
      <Button
        variant='outline'
        icon={<RefreshCw className='h-4 w-4' />}
        onClick={() => {
          void preference.refetch();
          void game.refetch();
        }}>
        {t("myMods.compatibility.retry")}
      </Button>
    );
  }
  if (count === 0) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            className='border-primary/40 bg-primary/10 hover:bg-primary/20'
            disabled={
              !hasMods ||
              !gamePath ||
              preference.isPending ||
              pendingChanges > 0
            }
            icon={<ShieldCheck className='h-4 w-4 text-primary' />}
            onClick={() => setReviewOpen(true)}>
            {t("myMods.compatibility.label")}
            <span className='text-muted-foreground tabular-nums'>{count}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent className='max-w-xs space-y-1'>
          <p className='font-medium'>
            {t("myMods.compatibility.selected", { count })}
          </p>
          <p>{t("myMods.compatibility.launchFlow")}</p>
          {game.data ? <p>{t("myMods.compatibility.closeGame")}</p> : null}
        </TooltipContent>
      </Tooltip>
      <CompatibilityReviewDialog
        key={profileFolder ?? "default"}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        profileFolder={profileFolder}
        enabled={count > 0}
        gameRunning={!!game.data || game.isError}
      />
    </>
  );
}
