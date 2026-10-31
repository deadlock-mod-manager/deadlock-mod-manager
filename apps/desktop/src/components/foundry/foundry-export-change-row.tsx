import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowCounterClockwiseIcon,
  FileIcon,
  ImageIcon,
  MusicNotesIcon,
  PaintBrushIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { useFoundry } from "./foundry-context";
import type { Change, ChangeGroup } from "./use-foundry-export-changes";

export const GROUP_ICONS = {
  paint: PaintBrushIcon,
  cards: ImageIcon,
  sounds: MusicNotesIcon,
  files: FileIcon,
} satisfies Record<ChangeGroup, React.ElementType>;

export const ChangeRow = ({ change }: { change: Change }) => {
  const { t } = useTranslation();
  const { revertEntry, busy } = useFoundry();
  const Icon = GROUP_ICONS[change.group];
  return (
    <li className='flex items-center gap-2.5 rounded-md bg-background px-2 py-1.5'>
      {change.swatch ? (
        <span
          className='h-[22px] w-[22px] shrink-0 rounded-[5px] border border-white/15'
          style={{ backgroundColor: change.swatch }}
        />
      ) : change.thumb ? (
        <img
          alt=''
          className='h-[30px] w-[22px] shrink-0 rounded-[3px] object-cover'
          src={change.thumb}
        />
      ) : (
        <span className='flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-muted'>
          <Icon className='h-3 w-3' />
        </span>
      )}
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='truncate font-medium text-xs'>{change.label}</span>
        <span className='truncate text-[10px] text-muted-foreground'>
          {change.detail}
        </span>
      </span>
      <button
        aria-label={t("foundry.exportSheet.undo", { name: change.label })}
        className='flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground'
        disabled={busy}
        onClick={() =>
          revertEntry(change.path).catch((err) => {
            logger.withError(err).error("[Foundry] Revert failed");
            toast.error(t("foundry.editor.revertFailed"));
          })
        }
        title={t("foundry.exportSheet.undo", { name: change.label })}
        type='button'>
        <ArrowCounterClockwiseIcon className='h-[13px] w-[13px]' />
      </button>
    </li>
  );
};
