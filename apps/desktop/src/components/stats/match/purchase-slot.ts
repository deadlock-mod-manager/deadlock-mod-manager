import {
  isSlotType,
  type Purchase,
  type SlotType,
} from "@/lib/stats/match-analysis";

export const slotOf = (purchase: Purchase): SlotType | null =>
  isSlotType(purchase.item.item_slot_type)
    ? purchase.item.item_slot_type
    : null;
