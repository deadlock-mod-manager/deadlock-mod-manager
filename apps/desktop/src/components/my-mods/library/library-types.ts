import type { ModConflictStatus } from "@/lib/mods/conflicts";
import type { ModHealth } from "@/types/generated/ModHealth";
import { type LocalMod } from "@/types/mods";

export enum ViewMode {
  GRID = "grid",
  LIST = "list",
}

export type ModCardProps = {
  mod: LocalMod;
  conflictStatus: ModConflictStatus | undefined;
  onShowConflicts: () => void;
  health: ModHealth | undefined;
  contextMenuHint: boolean;
  onSelect: (id: string) => void;
  selected: boolean;
};
