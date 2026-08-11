import { Badge } from "@deadlock-mods/ui/components/badge";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { ImageIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { FoundryCardPreview } from "@/types/foundry";
import { FoundryCardAssembling } from "./foundry-assembling";
import { useFoundry } from "./foundry-context";
import { FoundryLoadingBar } from "./foundry-loading-bar";

const CARD_GRID_CLASS_NAME =
  "grid grid-cols-[repeat(auto-fill,minmax(8rem,9.5rem))] justify-start gap-2.5";

const CardTile = ({
  card,
  isSelected,
  isEdited,
  onSelect,
}: {
  card: FoundryCardPreview;
  isSelected: boolean;
  isEdited: boolean;
  onSelect: (card: FoundryCardPreview) => void;
}) => {
  const { t } = useTranslation();
  const variantLabel = t(`foundry.cards.variants.${card.variant}`, {
    defaultValue: card.variant.replaceAll("_", " "),
  });

  return (
    <button
      className={cn(
        "group min-w-0 overflow-hidden rounded-md border bg-background/65 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border/70 hover:border-primary/50 hover:bg-muted/60",
      )}
      onClick={() => onSelect(card)}
      title={card.path}
      type='button'>
      <div className='relative flex aspect-[3/4] items-center justify-center overflow-hidden bg-muted/40'>
        <img
          alt={variantLabel}
          className='max-h-full max-w-full object-contain'
          src={card.dataUrl}
        />
        {isEdited && (
          <Badge className='absolute top-1.5 right-1.5 text-[10px]'>
            {t("foundry.edited")}
          </Badge>
        )}
      </div>
      <div className='space-y-1 px-2 py-1.5'>
        <p className='truncate font-medium text-[11px]'>{variantLabel}</p>
        <p className='truncate text-muted-foreground text-[10px] tabular-nums'>
          {card.width} x {card.height}
        </p>
      </div>
    </button>
  );
};

/** Placeholder tiles whose card art builds itself out of particles. */
const LoadingGrid = () => (
  <div className={CARD_GRID_CLASS_NAME}>
    {["top-left", "top-right", "bottom-left", "bottom-right"].map((slot) => (
      <div
        className='overflow-hidden rounded-md border border-border/60 bg-background/50'
        key={slot}>
        <div className='aspect-[3/4] bg-muted/30'>
          <FoundryCardAssembling />
        </div>
        <div className='space-y-1 px-2 py-2'>
          <div className='h-2 w-2/3 animate-pulse rounded bg-muted' />
          <div className='h-2 w-1/2 animate-pulse rounded bg-muted/70' />
        </div>
      </div>
    ))}
  </div>
);

const CardSection = ({
  title,
  emptyLabel,
  cards,
  selectedCardKey,
  editedPaths,
  onSelect,
}: {
  title: string;
  emptyLabel: string;
  cards: FoundryCardPreview[];
  selectedCardKey: string | null;
  editedPaths: ReadonlySet<string>;
  onSelect: (card: FoundryCardPreview) => void;
}) => (
  <section className='space-y-2'>
    <div className='flex items-center justify-between gap-2'>
      <h3 className='font-medium text-sm'>{title}</h3>
      <Badge className='text-[10px]' variant='outline'>
        {cards.length}
      </Badge>
    </div>
    {cards.length > 0 ? (
      <div className={CARD_GRID_CLASS_NAME}>
        {cards.map((card) => (
          <CardTile
            card={card}
            isEdited={editedPaths.has(card.path)}
            isSelected={selectedCardKey === `${card.source}:${card.path}`}
            key={`${card.source}:${card.path}`}
            onSelect={onSelect}
          />
        ))}
      </div>
    ) : (
      <p className='rounded-md border border-dashed px-3 py-4 text-center text-muted-foreground text-xs'>
        {emptyLabel}
      </p>
    )}
  </section>
);

export const FoundryCardsPanel = () => {
  const { t } = useTranslation();
  const { cardPreviews, previewCard, selectedCardKey, editedPaths } =
    useFoundry();
  const isLoading = cardPreviews.status === "loading";

  if (isLoading) {
    return (
      <div className='space-y-3'>
        <div className='flex items-center gap-2 text-muted-foreground text-xs'>
          <ImageIcon className='h-4 w-4' weight='duotone' />
          <span>{t("foundry.cards.loading")}</span>
        </div>
        <FoundryLoadingBar />
        <LoadingGrid />
      </div>
    );
  }

  if (cardPreviews.status === "error") {
    return (
      <p className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-4 text-destructive text-xs'>
        {t("foundry.cards.loadFailed")}
      </p>
    );
  }

  return (
    <div className='space-y-5'>
      <CardSection
        cards={cardPreviews.modCards}
        editedPaths={editedPaths}
        emptyLabel={t("foundry.cards.noModCards")}
        onSelect={previewCard}
        selectedCardKey={selectedCardKey}
        title={t("foundry.cards.modCards")}
      />
      <CardSection
        cards={cardPreviews.defaultCards}
        editedPaths={editedPaths}
        emptyLabel={t("foundry.cards.noDefaultCards")}
        onSelect={previewCard}
        selectedCardKey={selectedCardKey}
        title={t("foundry.cards.defaultCards")}
      />
    </div>
  );
};
