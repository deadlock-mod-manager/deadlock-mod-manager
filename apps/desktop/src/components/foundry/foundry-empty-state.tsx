import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowSquareOutIcon,
  FireIcon,
  InfoIcon,
  PaintBrushIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { COMMISSIONS_URL } from "@/lib/constants";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { FoundrySkinPicker } from "./foundry-skin-picker";

const DEADLOCK_FORGE_URL = "https://deadlockforge.net/";

const openExternal = (url: string, label: string) => {
  openUrl(url).catch((error) => {
    logger.withError(error).error(`[Foundry] Could not open ${label}`);
  });
};

const ExternalLink = ({
  icon,
  title,
  description,
  domain,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  domain: string;
  onClick: () => void;
}) => (
  <button
    className='flex w-full gap-3 rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-primary/60'
    onClick={onClick}
    type='button'>
    <span className='flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[7px] bg-secondary text-secondary-foreground'>
      {icon}
    </span>
    <span className='flex min-w-0 flex-col gap-[3px]'>
      <span className='flex items-center gap-1.5 font-semibold text-[13px]'>
        {title}
        <ArrowSquareOutIcon className='h-[13px] w-[13px] text-muted-foreground' />
      </span>
      <span className='text-muted-foreground text-xs leading-[1.4]'>
        {description}
      </span>
      <span className='font-mono text-[11px] text-muted-foreground/70'>
        {domain}
      </span>
    </span>
  </button>
);

/**
 * The Foundry's start page: the skin picker is the page, with the community's
 * other skin sources beside it.
 */
export const FoundryEmptyState = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const forgeInstallEnabled = usePersistedStore(
    (state) => state.forgeInstallEnabled,
  );
  const setForgeInstallEnabled = usePersistedStore(
    (state) => state.setForgeInstallEnabled,
  );

  // The 1-click handoff only works if the bridge is on, and the site gives no
  // hint that it is off. Offer the switch here, then leave for the site either
  // way.
  const handleForgeClick = async () => {
    if (!forgeInstallEnabled) {
      const accepted = !!(await confirm({
        title: t("forge.openTitle"),
        body: t("forge.openBody"),
        actionButton: t("forge.openAction"),
        actionButtonVariant: "default",
        cancelButton: t("forge.openCancel"),
      }));
      if (accepted) {
        setForgeInstallEnabled(true);
        toast.success(t("forge.openEnabled"));
      }
    }
    openExternal(DEADLOCK_FORGE_URL, "Deadlock Forge");
  };

  return (
    <div className='flex h-full w-full gap-7'>
      <div className='flex min-w-0 flex-1 flex-col gap-4'>
        <div className='shrink-0 space-y-1'>
          <h1 className='font-semibold text-[22px]'>{t("foundry.title")}</h1>
          <p className='text-[13px] text-muted-foreground'>
            {t("foundry.picker.subtitle")}
          </p>
        </div>
        <FoundrySkinPicker className='flex-1' />
      </div>

      <aside className='flex w-72 shrink-0 flex-col gap-3 pt-[62px]'>
        <p className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
          {t("foundry.picker.moreWays")}
        </p>
        <ExternalLink
          description={t("foundry.picker.forgeDescription")}
          domain='deadlockforge.net'
          icon={<FireIcon className='h-[17px] w-[17px]' weight='duotone' />}
          onClick={handleForgeClick}
          title={t("foundry.empty.forgeTitle")}
        />
        <ExternalLink
          description={t("foundry.picker.commissionsDescription")}
          domain='commissions.deadlockmods.app'
          icon={
            <PaintBrushIcon className='h-[17px] w-[17px]' weight='duotone' />
          }
          onClick={() => openExternal(COMMISSIONS_URL, "Commissions")}
          title={t("foundry.empty.commissionsTitle")}
        />
        <p className='flex gap-2 px-0.5 py-1 text-[11px] text-muted-foreground/70 leading-[1.4]'>
          <InfoIcon className='mt-px h-[13px] w-[13px] shrink-0' />
          {t("foundry.picker.scope")}
        </p>
      </aside>
    </div>
  );
};
