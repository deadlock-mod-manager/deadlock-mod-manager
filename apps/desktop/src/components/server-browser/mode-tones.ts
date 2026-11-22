export interface ModeTone {
  /** Background tint for badges/pills. */
  bg: string;
  /** Foreground text color for badges/pills. */
  text: string;
  /** Inset ring color for badges/pills. */
  ring: string;
  /** Solid swatch color for compact dot indicators (e.g. select items). */
  dot: string;
}

export const MODE_TONES: ReadonlyArray<ModeTone> = [
  {
    bg: "bg-sky-500/10",
    text: "text-sky-300",
    ring: "ring-sky-500/30",
    dot: "bg-sky-400",
  },
  {
    bg: "bg-violet-500/10",
    text: "text-violet-300",
    ring: "ring-violet-500/30",
    dot: "bg-violet-400",
  },
  {
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-400",
  },
  {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    ring: "ring-amber-500/30",
    dot: "bg-amber-400",
  },
  {
    bg: "bg-rose-500/10",
    text: "text-rose-300",
    ring: "ring-rose-500/30",
    dot: "bg-rose-400",
  },
  {
    bg: "bg-cyan-500/10",
    text: "text-cyan-300",
    ring: "ring-cyan-500/30",
    dot: "bg-cyan-400",
  },
];

const hashString = (value: string): number => {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
};

/**
 * Deterministically picks a mode tone based on the mode string so the same
 * game mode always renders with the same accent across the UI.
 */
export const modeTone = (mode: string): ModeTone | null => {
  if (!mode) return null;
  return MODE_TONES[hashString(mode) % MODE_TONES.length];
};
