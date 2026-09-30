import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useModCompatibility } from "@/hooks/use-mod-compatibility";
import { isGameRunning } from "@/lib/tauri-commands";
import { usePersistedStore } from "@/lib/store";
import { CompatibilityReviewDialog } from "./compatibility-review-dialog";

export function ModCompatibilityControl({
  profileFolder,
  hasMods,
}: {
  profileFolder: string | null;
  hasMods: boolean;
}) {
  const { t } = useTranslation();
  const gamePath = usePersistedStore((state) => state.gamePath);
  const { preference, changePreference } = useModCompatibility(profileFolder);
  const [reviewOpen, setReviewOpen] = useState(false);
  const game = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    enabled: !!gamePath,
    refetchInterval: 5000,
  });
  const enabled = preference.data ?? false;
  const gameRunning = game.data ?? false;
  const busy = preference.isPending || changePreference.isPending;
  return (
    <div className='flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b py-3'>
      <div className='flex items-start gap-3'>
        <Switch
          id='enable-mod-compatibility'
          className='mt-0.5 shrink-0'
          aria-describedby='mod-compatibility-description'
          checked={enabled}
          disabled={
            busy ||
            preference.isError ||
            gameRunning ||
            (!!gamePath && game.isPending)
          }
          onCheckedChange={(value) =>
            changePreference.mutate(value, {
              onSuccess: () => {
                if (value && hasMods && gamePath) setReviewOpen(true);
              },
            })
          }
        />
        <div className='space-y-1'>
          <Label
            htmlFor='enable-mod-compatibility'
            className='font-medium text-sm'>
            {t("myMods.compatibility.enable")}
          </Label>
          <p
            id='mod-compatibility-description'
            className='max-w-[65ch] text-muted-foreground text-xs'>
            {gameRunning
              ? t("myMods.compatibility.closeGame")
              : preference.isError
                ? t("myMods.compatibility.loadFailed")
                : t("myMods.compatibility.description")}
          </p>
        </div>
      </div>
      {preference.isError ? (
        <Button
          variant='outline'
          size='sm'
          onClick={() => preference.refetch()}>
          {t("myMods.compatibility.retry")}
        </Button>
      ) : (
        <Button
          variant='outline'
          size='sm'
          disabled={!hasMods || !gamePath || busy || preference.isError}
          onClick={() => setReviewOpen(true)}>
          {t("myMods.compatibility.review")}
        </Button>
      )}
      <CompatibilityReviewDialog
        key={profileFolder ?? "default"}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        profileFolder={profileFolder}
        enabled={enabled}
        gameRunning={gameRunning}
      />
    </div>
  );
}
