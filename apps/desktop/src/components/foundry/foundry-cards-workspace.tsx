import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  CardsIcon,
  DownloadSimpleIcon,
  ImageIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { DEFAULT_FOUNDRY_SKINS } from "@/lib/foundry-default-skins";
import logger from "@/lib/logger";
import type { FoundryCardPreview } from "@/types/foundry";
import { FoundryCardAssembling } from "./foundry-assembling";
import { useFoundry } from "./foundry-context";
import {
  extensionOf,
  FoundryDropZone,
  stageDroppedFile,
} from "./foundry-drop-zone";

/** Image formats the backend can re-encode into a `.vtex_c` container. */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

type SlotGroupId = "heroSelect" | "inMatch" | "hud" | "other";

const GROUP_OF = new Map<string, SlotGroupId>([
  ["card", "heroSelect"],
  ["vertical", "heroSelect"],
  ["card_critical", "inMatch"],
  ["card_gloat", "inMatch"],
  ["minimap", "hud"],
  ["mm", "hud"],
  ["small", "hud"],
  ["sm", "hud"],
]);
const groupOf = (card: FoundryCardPreview): SlotGroupId =>
  GROUP_OF.get(card.variant) ?? "other";
const GROUP_ORDER: SlotGroupId[] = ["heroSelect", "inMatch", "hud", "other"];

/** How tall each slot is drawn; widths follow the card's own proportions. */
const SLOT_HEIGHT = new Map<string, number>([
  ["card", 256],
  ["vertical", 186],
  ["card_critical", 196],
  ["card_gloat", 196],
  ["minimap", 60],
  ["mm", 60],
  ["small", 104],
  ["sm", 104],
]);
const DEFAULT_SLOT_HEIGHT = 112;

const cardKey = (card: FoundryCardPreview) => `${card.source}:${card.path}`;

/**
 * One slot per card the hero has: the skin's own art where it ships some,
 * the base game's otherwise.
 */
const slotCards = (
  modCards: FoundryCardPreview[],
  defaultCards: FoundryCardPreview[],
) => {
  const byPath = new Map<string, FoundryCardPreview>();
  for (const card of defaultCards) byPath.set(card.path, card);
  for (const card of modCards) byPath.set(card.path, card);
  return [...byPath.values()];
};

const variantLabel = (t: TFunction, card: FoundryCardPreview) =>
  t(`foundry.cards.variants.${card.variant}`, {
    defaultValue: card.variant.replaceAll("_", " "),
  });

const CardSlot = ({
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
  const height = SLOT_HEIGHT.get(card.variant) ?? DEFAULT_SLOT_HEIGHT;
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

const LoadingBoard = () => {
  const { t } = useTranslation();
  return (
    <div className='space-y-3 p-6'>
      <p className='flex items-center gap-2 text-muted-foreground text-xs'>
        <ImageIcon className='h-4 w-4' weight='duotone' />
        {t("foundry.cards.loading")}
      </p>
      <div className='flex gap-3'>
        {["one", "two", "three", "four"].map((slot) => (
          <div
            className='h-56 w-40 overflow-hidden rounded-md border bg-muted/30'
            key={slot}>
            <FoundryCardAssembling />
          </div>
        ))}
      </div>
    </div>
  );
};

/** The selected card in a hero-select lineup, the way players will see it. */
const HeroSelectStage = ({ card }: { card: FoundryCardPreview }) => {
  const { manifest } = useFoundry();
  const hero = manifest?.heroDisplay ?? manifest?.hero ?? "";
  const neighbours = DEFAULT_FOUNDRY_SKINS.filter(
    (skin) => skin.hero !== hero,
  ).slice(0, 2);

  return (
    <div className='relative flex h-[200px] items-center justify-center gap-3 overflow-hidden rounded-lg bg-gradient-to-b from-muted/60 to-background'>
      <img
        alt=''
        className='h-[84px] w-[62px] rounded object-cover opacity-35'
        src={neighbours[0]?.image}
      />
      <div className='relative h-[150px] w-[110px] overflow-hidden rounded border-2 border-primary shadow-[0_0_24px_-6px_hsl(var(--primary))]'>
        <img alt='' className='h-full w-full object-cover' src={card.dataUrl} />
        <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent pt-8 pb-2 text-center font-bold text-xs uppercase tracking-[0.12em]'>
          {hero}
        </div>
      </div>
      <img
        alt=''
        className='h-[84px] w-[62px] rounded object-cover opacity-35'
        src={neighbours[1]?.image}
      />
    </div>
  );
};

const CardInspector = ({ card }: { card: FoundryCardPreview | null }) => {
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
        {group === "heroSelect" ? (
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
