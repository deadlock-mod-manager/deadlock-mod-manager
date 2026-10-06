import { Button } from "@deadlock-mods/ui/components/button";
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
  return (
    <div className='space-y-1 border-b py-3'>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
        <p className='text-sm text-muted-foreground'>
          {count > 0
            ? t("myMods.compatibility.selected", { count })
            : t("myMods.compatibility.selectMods")}
        </p>
        {preference.isError || game.isError ? (
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              void preference.refetch();
              void game.refetch();
            }}>
            {t("myMods.compatibility.retry")}
          </Button>
        ) : count > 0 ? (
          <Button
            variant='outline'
            size='sm'
            disabled={
              !hasMods ||
              !gamePath ||
              preference.isPending ||
              pendingChanges > 0
            }
            onClick={() => setReviewOpen(true)}>
            {t("myMods.compatibility.review")}
          </Button>
        ) : null}
      </div>
      {count > 0 ? (
        <p className='text-xs text-muted-foreground'>
          {t("myMods.compatibility.launchFlow")}
        </p>
      ) : null}
      {game.data ? (
        <p className='text-muted-foreground text-xs'>
          {t("myMods.compatibility.closeGame")}
        </p>
      ) : null}
      <CompatibilityReviewDialog
        key={profileFolder ?? "default"}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        profileFolder={profileFolder}
        enabled={count > 0}
        gameRunning={!!game.data || game.isError}
      />
    </div>
  );
}
