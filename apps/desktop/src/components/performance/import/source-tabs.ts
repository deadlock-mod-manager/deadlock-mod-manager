import type { ImportSource } from "@/types/generated/ImportSource";
import {
  ClipboardTextIcon,
  FileIcon,
  GlobeIcon,
  HardDrivesIcon,
} from "@phosphor-icons/react";

export const SOURCE_TABS = [
  { value: "paste", icon: ClipboardTextIcon },
  { value: "file", icon: FileIcon },
  { value: "gamebanana", icon: GlobeIcon },
  { value: "current", icon: HardDrivesIcon },
] as const;

export type SourceTab = (typeof SOURCE_TABS)[number]["value"];

export const isSourceTab = (value: string): value is SourceTab =>
  SOURCE_TABS.some((tab) => tab.value === value);

export const initialTab = (source: ImportSource | null): SourceTab => {
  switch (source?.kind) {
    case "file":
      return "file";
    case "gameBanana":
      return "gamebanana";
    case "currentGameinfo":
      return "current";
    default:
      return "paste";
  }
};

/** Sources that arrive from elsewhere in the app instead of from the tabs. */
export const isHandedOver = (source: ImportSource | null) =>
  source?.kind === "staged" || source?.kind === "gameBanana";
