import { cn } from "@deadlock-mods/ui/lib/utils";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FoundryCardPreview } from "@/types/foundry";
import {
  ABILITY_PREFIX,
  ABILITY_SLOT_HEIGHT,
  SLOT_HEIGHT,
  DEFAULT_SLOT_HEIGHT,
  variantLabel,
} from "./foundry-card-utils";

export const CardSlot = ({
  card,
  selected,
  edited,
  dragging,
  onSelect,
  onDropFile,
}: {
  card: FoundryCardPreview;
  selected: boolean;
  edited: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDropFile: (file: File) => void;
}) => {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const height = card.variant.startsWith(ABILITY_PREFIX)
    ? ABILITY_SLOT_HEIGHT
    : (SLOT_HEIGHT.get(card.variant) ?? DEFAULT_SLOT_HEIGHT);
  const width = Math.round((height * card.width) / Math.max(card.height, 1));
  const label = variantLabel(t, card);

  return (
    <div className='flex flex-col gap-2' style={{ width }}>
      <button
        aria-label={label}
        aria-pressed={selected}
        className={cn(
          "relative overflow-hidden rounded-md border bg-muted transition-colors",
          selected ? "border-2 border-primary" : "hover:border-primary/50",
          dragging && !over && "border-dashed border-primary/60",
        )}
        onClick={onSelect}
        onDragLeave={() => setOver(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files[0];
          if (file) onDropFile(file);
        }}
        style={{ height }}
        title={card.path}
        type='button'>
        <img
          alt=''
          className='h-full w-full object-cover'
          draggable={false}
          src={card.dataUrl}
        />
        {edited && (
          <span className='absolute top-1.5 left-1.5 flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 font-semibold text-[10px]'>
            <span className='h-1.5 w-1.5 rounded-full bg-orange-400' />
            {t("foundry.cards.replaced")}
          </span>
        )}
        {over && (
          <span className='absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/75 p-2 text-center'>
            <span className='absolute inset-2 rounded border-[1.5px] border-primary' />
            <DownloadSimpleIcon className='h-5 w-5 text-primary' />
            <span className='font-semibold text-primary text-xs'>
              {t("foundry.cards.dropToReplace")}
            </span>
          </span>
        )}
      </button>
      <div className='flex flex-col gap-px'>
        <span
          className={cn(
            "truncate text-xs",
            selected ? "font-semibold" : "font-medium text-foreground/85",
          )}>
          {label}
        </span>
        <span className='font-mono text-[10px] text-muted-foreground'>
          {card.width} × {card.height}
        </span>
      </div>
    </div>
  );
};
