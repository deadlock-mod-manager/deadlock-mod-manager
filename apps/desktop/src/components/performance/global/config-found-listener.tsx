import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Label } from "@deadlock-mods/ui/components/label";
import { ArrowRightIcon, GaugeIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { downloadManager } from "@/lib/download/manager";
import logger from "@/lib/logger";
import { discardPerfStaging } from "@/lib/performance/api";
import { pickableVariants } from "@/lib/performance/import/review";
import type { PerfImportNavigationState } from "@/lib/performance/import/save";
import { usePersistedStore } from "@/lib/store";
import type { ConfigFoundEvent } from "@/types/generated/ConfigFoundEvent";
import { VariantPicker } from "../import/import-source-panel";

const discardStaging = (stagingId: string) =>
  discardPerfStaging(stagingId).catch((error) =>
    logger.withError(error).warn("Discarding staged performance config failed"),
  );

const ConfigFoundDialog = ({
  found,
  onDone,
}: {
  found: ConfigFoundEvent;
  onDone: () => void;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dismissModConfig = usePersistedStore((state) => state.dismissModConfig);
  const variants = pickableVariants(found.variants);
  const [variantPath, setVariantPath] = useState(
    variants[0]?.path ?? found.variants[0]?.path ?? null,
  );
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const finish = () => {
    if (dontAskAgain) dismissModConfig(found.modId);
    onDone();
  };

  const notNow = () => {
    discardStaging(found.stagingId);
    finish();
  };

  const review = () => {
    if (!variantPath) return;
    const state: PerfImportNavigationState = {
      importSource: {
        kind: "staged",
        staging_id: found.stagingId,
        variant_path: variantPath,
      },
      importContext: { modId: found.modId, modName: found.modName },
    };
    navigate("/performance", { state });
    finish();
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) notNow();
      }}
      open>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <div className='mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10'>
            <GaugeIcon className='h-5 w-5 text-primary' weight='bold' />
          </div>
          <DialogTitle>{t("performance.modConfigFound.title")}</DialogTitle>
          <DialogDescription>
            {found.installedVpks > 0
              ? t("performance.modConfigFound.withVpks", {
                  modName: found.modName,
                })
              : t("performance.modConfigFound.withoutVpks", {
                  modName: found.modName,
                })}
          </DialogDescription>
        </DialogHeader>

        <VariantPicker
          className='max-h-72 overflow-y-auto'
          onPick={setVariantPath}
          title={t("performance.modConfigFound.pickVersion")}
          value={variantPath}
          variants={found.variants}
        />

        <DialogFooter className='items-center gap-2 sm:justify-between'>
          <Label className='flex cursor-pointer items-center gap-2 font-normal text-muted-foreground text-sm'>
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            {t("performance.modConfigFound.dontAskAgain")}
          </Label>
          <div className='flex gap-2'>
            <Button onClick={notNow} variant='ghost'>
              {t("performance.modConfigFound.notNow")}
            </Button>
            <Button
              disabled={!variantPath}
              icon={<ArrowRightIcon weight='bold' />}
              onClick={review}>
              {t("performance.modConfigFound.review")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Asks what to do with a performance config found in a downloaded mod's
 * archive. Mods the user chose not to be asked about again are skipped, and
 * their staged files discarded.
 */
export const ConfigFoundListener = () => {
  const [queue, setQueue] = useState<ConfigFoundEvent[]>([]);

  useEffect(() => {
    downloadManager.setConfigFoundHandler((found) => {
      if (usePersistedStore.getState().perfDismissedModConfigs[found.modId]) {
        discardStaging(found.stagingId);
        return;
      }
      setQueue((current) => [...current, found]);
    });
    return () => downloadManager.setConfigFoundHandler(undefined);
  }, []);

  const current = queue[0];
  if (!current) return null;
  return (
    <ConfigFoundDialog
      found={current}
      key={current.stagingId}
      onDone={() => setQueue((pending) => pending.slice(1))}
    />
  );
};
