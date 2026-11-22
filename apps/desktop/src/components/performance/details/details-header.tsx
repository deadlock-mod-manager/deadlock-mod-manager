import {
  SheetDescription,
  SheetTitle,
} from "@deadlock-mods/ui/components/sheet";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import logger from "@/lib/logger";
import type { PerfTier } from "@/types/generated/PerfTier";
import { TierLabel } from "../configs/card-parts";

const openExternal = (url: string) =>
  openUrl(url).catch((error) => {
    logger.withError(error).error("Failed to open link");
  });

/** Inline link for running text; `Trans` fills in the label. */
export const ExternalLink = ({
  url,
  children,
}: {
  url: string;
  children?: ReactNode;
}) => (
  <button
    className='text-foreground/90 underline decoration-foreground/30 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
    onClick={() => openExternal(url)}
    type='button'>
    {children}
  </button>
);

export const LinkChip = ({
  icon,
  url,
  children,
}: {
  icon: ReactNode;
  url: string;
  children: ReactNode;
}) => (
  <button
    className='inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground leading-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-3'
    onClick={() => openExternal(url)}
    type='button'>
    {icon}
    {children}
  </button>
);

export const DetailsHeader = ({
  tier,
  name,
  chips,
  blurb,
}: {
  tier: PerfTier | null;
  name: string;
  chips: ReactNode;
  blurb: string | null;
}) => (
  <div className='flex flex-col gap-2 border-b px-6 pt-6 pb-4 pr-12'>
    {tier && <TierLabel tier={tier} />}
    <SheetTitle className='text-xl'>{name}</SheetTitle>
    <div className='flex flex-wrap gap-1.5'>{chips}</div>
    {blurb && (
      <SheetDescription className='text-foreground/90'>
        {blurb}
      </SheetDescription>
    )}
  </div>
);
