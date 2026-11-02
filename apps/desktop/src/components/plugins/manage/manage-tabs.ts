export const TABS = ["installed", "discover", "updates"] as const;

export type Tab = (typeof TABS)[number];

export const matches = (needle: string, ...texts: (string | null)[]) =>
  !needle || texts.some((text) => text?.toLowerCase().includes(needle));
