import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CardsIcon } from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import type { FoundryCardPreview } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { extensionOf, stageDroppedFile } from "./foundry-drop-zone";
import { slotCards, GROUP_ORDER, groupOf, cardKey } from "./foundry-card-utils";
import { IMAGE_EXTENSIONS, CardInspector } from "./foundry-card-inspector";
import { LoadingBoard } from "./foundry-card-loading-board";
import { CardSlot } from "./foundry-card-slot";

/** The cards tab: every card slot the hero has, and the selected one's details. */
export const FoundryCardsWorkspace = ({
  sidePanelClassName,
}: {
  sidePanelClassName: string;
}) => {
  const { t } = useTranslation();
  const {
    cardPreviews,
    previewCard,
    selectedCardKey,
    editedPaths,
    workspace,
    busy,
    replaceEntry,
  } = useFoundry();
  const [dragDepth, setDragDepth] = useState(0);

  const cards = useMemo(
    () => slotCards(cardPreviews.modCards, cardPreviews.defaultCards),
    [cardPreviews.modCards, cardPreviews.defaultCards],
  );
  const groups = useMemo(
    () =>
      GROUP_ORDER.map((id) => ({
        id,
        cards: cards.filter((card) => groupOf(card) === id),
      })).filter((group) => group.cards.length > 0),
    [cards],
  );
  const selected =
    cards.find((card) => cardKey(card) === selectedCardKey) ?? null;

  const dropOn = useCallback(
    async (card: FoundryCardPreview, file: File) => {
      if (!workspace || busy) return;
      if (!IMAGE_EXTENSIONS.includes(extensionOf(file.name))) {
        toast.error(t("foundry.cards.wrongFile"));
        return;
      }
      previewCard(card);
      try {
        await replaceEntry(card.path, await stageDroppedFile(file));
        toast.success(t("foundry.editor.replaced", { file: card.filename }));
      } catch (err) {
        logger.withError(err).error("[Foundry] Replace failed");
        toast.error(t("foundry.editor.replaceFailed"));
      }
    },
    [busy, previewCard, replaceEntry, t, workspace],
  );

  const firstLoad = cardPreviews.status === "loading" && cards.length === 0;

  return (
    <>
      <ScrollArea className='min-w-0 flex-1'>
        {firstLoad ? (
          <LoadingBoard />
        ) : cardPreviews.status === "error" ? (
          <p className='m-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-4 text-destructive text-xs'>
            {t("foundry.cards.loadFailed")}
          </p>
        ) : (
          <div
            className='space-y-[22px] px-6 py-[22px]'
            onDragEnter={() => setDragDepth((depth) => depth + 1)}
            onDragLeave={() => setDragDepth((depth) => Math.max(0, depth - 1))}
            onDrop={() => setDragDepth(0)}>
            <p className='text-muted-foreground text-xs'>
              {t("foundry.cards.intro")}
            </p>
            <div className='flex flex-wrap items-end gap-x-10 gap-y-6'>
              {groups.map((group) => (
                <section className='flex flex-col gap-3' key={group.id}>
                  <div className='flex flex-col gap-0.5'>
                    <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
                      {t(`foundry.cards.groups.${group.id}.title`)}
                    </h3>
                    <p className='text-[11px] text-muted-foreground/70'>
                      {t(`foundry.cards.groups.${group.id}.where`)}
                    </p>
                  </div>
                  <div className='flex items-end gap-3'>
                    {group.cards.map((card) => (
                      <CardSlot
                        card={card}
                        dragging={dragDepth > 0}
                        edited={editedPaths.has(card.path)}
                        key={cardKey(card)}
                        onDropFile={(file) => dropOn(card, file)}
                        onSelect={() => previewCard(card)}
                        selected={cardKey(card) === selectedCardKey}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {cardPreviews.modCards.length === 0 && (
              <div className='flex max-w-xl items-start gap-3 rounded-lg border p-4'>
                <span className='flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[7px] border bg-card'>
                  <CardsIcon className='h-[17px] w-[17px] text-muted-foreground' />
                </span>
                <div className='space-y-0.5'>
                  <p className='font-medium text-[13px]'>
                    {t("foundry.cards.noSkinArtTitle")}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    {t("foundry.cards.noSkinArtHint")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      <div className={cn(sidePanelClassName, "w-[292px] border-l")}>
        <CardInspector card={selected} />
      </div>
    </>
  );
};
