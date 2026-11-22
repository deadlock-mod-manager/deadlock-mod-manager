import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { ArrowCounterClockwiseIcon, ImageIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import type { FoundryCardPreview } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { FoundryDropZone } from "./foundry-drop-zone";
import { groupOf, variantLabel } from "./foundry-card-utils";
import { HeroSelectStage } from "./foundry-card-hero-select-stage";

/** Image formats the backend can re-encode into a `.vtex_c` container. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

export const CardInspector = ({
  card,
}: {
  card: FoundryCardPreview | null;
}) => {
  const { t } = useTranslation();
  const { workspace, busy, editedPaths, replaceEntry, revertEntry } =
    useFoundry();

  const replace = useCallback(
    async (path: string) => {
      if (!card) return;
      try {
        await replaceEntry(card.path, path);
        toast.success(t("foundry.editor.replaced", { file: card.filename }));
      } catch (err) {
        logger.withError(err).error("[Foundry] Replace failed");
        toast.error(t("foundry.editor.replaceFailed"));
      }
    },
    [card, replaceEntry, t],
  );

  if (!card) {
    return (
      <p className='p-4 text-muted-foreground text-sm'>
        {t("foundry.cards.pick")}
      </p>
    );
  }

  const edited = editedPaths.has(card.path);
  const group = groupOf(card);
  const disabled = !workspace || busy;

  return (
    <ScrollArea className='h-full'>
      <div className='space-y-0.5 border-b px-4 py-3.5'>
        <p className='font-semibold text-sm'>{variantLabel(t, card)}</p>
        <p className='text-[11px] text-muted-foreground'>
          {t("foundry.cards.meta", {
            group: t(`foundry.cards.groups.${group}.title`),
            size: `${card.width} × ${card.height}`,
            state: t(
              edited
                ? "foundry.cards.stateReplaced"
                : card.source === "mod"
                  ? "foundry.cards.stateSkin"
                  : "foundry.cards.stateOriginal",
            ),
          })}
        </p>
      </div>
      <section className='space-y-2.5 border-b px-4 py-3.5'>
        <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
          {t("foundry.cards.inGame")}
        </h3>
        {group === "heroSelect" && card.variant !== "background" ? (
          <HeroSelectStage card={card} />
        ) : (
          <div className='flex h-[200px] items-center justify-center rounded-lg bg-gradient-to-b from-muted/60 to-background'>
            <img
              alt=''
              className='max-h-[160px] max-w-[200px] rounded object-contain'
              src={card.dataUrl}
            />
          </div>
        )}
      </section>
      <section className='space-y-2.5 px-4 py-3.5'>
        <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
          {t("foundry.editor.replaceLabel")}
        </h3>
        <div className='flex gap-4 rounded-md bg-background px-2.5 py-2'>
          <div className='flex flex-col gap-0.5'>
            <span className='font-medium text-[10px] text-muted-foreground'>
              {t("foundry.cards.original")}
            </span>
            <span className='font-mono font-medium text-xs'>
              {card.width} × {card.height}
            </span>
          </div>
          <div className='flex flex-col gap-0.5'>
            <span className='font-medium text-[10px] text-muted-foreground'>
              {t("foundry.cards.dropAtLeast")}
            </span>
            <span className='font-mono font-medium text-xs'>
              {card.width} × {card.height}
            </span>
          </div>
        </div>
        <FoundryDropZone
          dialogTitle={t("foundry.editor.replaceTitle")}
          disabled={disabled}
          extensions={IMAGE_EXTENSIONS}
          icon={
            <ImageIcon className='h-[18px] w-[18px] text-muted-foreground' />
          }
          onFile={replace}
          title={t("foundry.drop.image")}
        />
        <button
          className={cn(
            "flex items-center gap-1.5 font-medium text-xs transition-colors",
            edited && !disabled
              ? "text-foreground hover:text-primary"
              : "pointer-events-none text-muted-foreground/50",
          )}
          disabled={!edited || disabled}
          onClick={() =>
            revertEntry(card.path).catch((err) => {
              logger.withError(err).error("[Foundry] Revert failed");
              toast.error(t("foundry.editor.revertFailed"));
            })
          }
          type='button'>
          <ArrowCounterClockwiseIcon className='h-[13px] w-[13px]' />
          {t("foundry.editor.revertToOriginal")}
        </button>
      </section>
    </ScrollArea>
  );
};
