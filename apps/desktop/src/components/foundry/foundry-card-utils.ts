import type { TFunction } from "i18next";
import type { FoundryCardPreview } from "@/types/foundry";

type SlotGroupId =
  | "heroSelect"
  | "inMatch"
  | "abilities"
  | "hud"
  | "weapon"
  | "other";

export const ABILITY_PREFIX = "ability_";

const GROUP_OF = new Map<string, SlotGroupId>([
  ["card", "heroSelect"],
  ["vertical", "heroSelect"],
  ["background", "heroSelect"],
  ["weapon", "weapon"],
  ["card_critical", "inMatch"],
  ["card_gloat", "inMatch"],
  ["minimap", "hud"],
  ["mm", "hud"],
  ["small", "hud"],
  ["sm", "hud"],
]);

export const groupOf = (card: FoundryCardPreview): SlotGroupId =>
  card.variant.startsWith(ABILITY_PREFIX)
    ? "abilities"
    : (GROUP_OF.get(card.variant) ?? "other");

export const GROUP_ORDER: SlotGroupId[] = [
  "heroSelect",
  "inMatch",
  "abilities",
  "hud",
  "weapon",
  "other",
];

/** How tall each slot is drawn; widths follow the card's own proportions. */
export const SLOT_HEIGHT = new Map<string, number>([
  ["background", 104],
  ["weapon", 72],
  ["card", 256],
  ["vertical", 186],
  ["card_critical", 196],
  ["card_gloat", 196],
  ["minimap", 60],
  ["mm", 60],
  ["small", 104],
  ["sm", 104],
]);

export const DEFAULT_SLOT_HEIGHT = 112;

export const ABILITY_SLOT_HEIGHT = 64;

export const cardKey = (card: FoundryCardPreview) =>
  `${card.source}:${card.path}`;

/**
 * One slot per card the hero has: the skin's own art where it ships some,
 * the base game's otherwise.
 */
export const slotCards = (
  modCards: FoundryCardPreview[],
  defaultCards: FoundryCardPreview[],
) => {
  const byPath = new Map<string, FoundryCardPreview>();
  for (const card of defaultCards) byPath.set(card.path, card);
  for (const card of modCards) byPath.set(card.path, card);
  return [...byPath.values()];
};

/** "pork_bun" to "Pork bun", for the variants the game names after the art. */
const humanize = (name: string) => {
  const words = name.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const variantLabel = (t: TFunction, card: FoundryCardPreview) =>
  card.variant.startsWith(ABILITY_PREFIX)
    ? humanize(card.variant.slice(ABILITY_PREFIX.length))
    : t(`foundry.cards.variants.${card.variant}`, {
        defaultValue: humanize(card.variant),
      });
