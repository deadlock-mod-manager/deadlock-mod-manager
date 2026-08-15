import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowSquareOutIcon,
  FireIcon,
  HammerIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { useFoundry } from "./foundry-context";
import { FoundryImportDialog } from "./foundry-import-dialog";
import { FoundryLoadingBar } from "./foundry-loading-bar";

const DEADLOCK_FORGE_URL = "https://deadlockforge.net/";

/**
 * One of the two entry points. The card lifts and warms on hover so the pair
 * reads as a choice between equals, rather than a headline with a footnote.
 */
const EntryCard = ({
  icon,
  title,
  description,
  action,
  onClick,
  disabled,
  external,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
  external?: boolean;
  children?: React.ReactNode;
}) => (
  <button
    className={cn(
      "group relative flex w-full flex-col items-center gap-4 overflow-hidden rounded-2xl border p-8 text-center transition-all duration-300",
      "border-border/60 bg-card/40 hover:-translate-y-1 hover:border-primary/50 hover:bg-card/70",
      "hover:shadow-[0_18px_50px_-24px_hsl(var(--primary))]",
      disabled && "pointer-events-none opacity-60",
    )}
    disabled={disabled}
    onClick={onClick}
    type='button'>
    {/* A soft glow behind the icon, revealed on hover. */}
    <span
      aria-hidden
      className='pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.18),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100'
    />

    <span className='relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105'>
      {icon}
    </span>

    <span className='relative space-y-1.5'>
      <span className='block font-semibold text-xl'>{title}</span>
      <span className='block max-w-xs text-muted-foreground text-sm leading-relaxed'>
        {description}
      </span>
    </span>

    <span className='relative flex items-center gap-1.5 font-medium text-primary text-sm'>
      {action}
      {external && <ArrowSquareOutIcon className='h-4 w-4' />}
    </span>

    {children}
  </button>
);

/**
 * Landing surface shown before a skin is loaded: build one here, or head over to
 * Deadlock Forge for the community's tooling.
 */
export const FoundryEmptyState = () => {
  const { t } = useTranslation();
  const { status } = useFoundry();
  const [importOpen, setImportOpen] = useState(false);
  const analyzing = status === "analyzing";

  return (
    <div className='flex h-full w-full flex-col items-center justify-center gap-8 p-8'>
      <div className='max-w-xl space-y-2 text-center'>
        <h2 className='font-semibold text-2xl'>{t("foundry.empty.title")}</h2>
        <p className='text-muted-foreground text-sm'>
          {t("foundry.empty.description")}
        </p>
      </div>

      <div className='grid w-full max-w-3xl gap-4 sm:grid-cols-2'>
        <EntryCard
          action={
            analyzing ? t("foundry.import.analyzing") : t("foundry.import.cta")
          }
          description={t("foundry.empty.foundryDescription")}
          disabled={analyzing}
          icon={<HammerIcon className='h-8 w-8' weight='duotone' />}
          onClick={() => setImportOpen(true)}
          title={t("foundry.empty.foundryTitle")}>
          {analyzing && (
            <span className='relative w-40'>
              <FoundryLoadingBar />
            </span>
          )}
        </EntryCard>

        <EntryCard
          action={t("foundry.empty.forgeAction")}
          description={t("foundry.empty.forgeDescription")}
          external
          icon={<FireIcon className='h-8 w-8' weight='duotone' />}
          onClick={() => {
            openUrl(DEADLOCK_FORGE_URL).catch((error) => {
              logger
                .withError(error)
                .error("[Foundry] Could not open Deadlock Forge");
            });
          }}
          title={t("foundry.empty.forgeTitle")}
        />
      </div>

      <p className='flex items-center gap-1.5 text-muted-foreground text-xs'>
        <UploadSimpleIcon className='h-3.5 w-3.5' />
        {t("foundry.empty.hint")}
      </p>

      <FoundryImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </div>
  );
};
