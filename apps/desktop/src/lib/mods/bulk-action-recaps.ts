import { create } from "zustand";
import type { BulkActionRecap, BulkModAction } from "@/lib/mods/bulk-action";

export const useBulkActionRecaps = create<
  Record<BulkModAction, BulkActionRecap | null>
>()(() => ({ disable: null, delete: null }));

export const setBulkActionRecap = (
  action: BulkModAction,
  recap: BulkActionRecap | null,
) => useBulkActionRecaps.setState({ [action]: recap });
