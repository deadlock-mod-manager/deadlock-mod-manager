import { create } from "zustand";
import type { BulkActionRecap, BulkModAction } from "@/lib/mods/bulk-action";

/**
 * The last stopped run of each bulk action, until the user closes its recap.
 * It lives outside the library page so a run that stops after the user left
 * the page still reaches them: the layout shows the recap on any page.
 */
export const useBulkActionRecaps = create<
  Record<BulkModAction, BulkActionRecap | null>
>()(() => ({ disable: null, delete: null }));

export const setBulkActionRecap = (
  action: BulkModAction,
  recap: BulkActionRecap | null,
) => useBulkActionRecaps.setState({ [action]: recap });
