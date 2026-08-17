export type HeroSelectionDeps<T> = {
  /** Returns false when the uninstall did not take effect; the change aborts. */
  uninstall: (mod: T) => Promise<boolean>;
  /** Returns false when the install did not succeed; the change aborts. */
  install: (mod: T) => Promise<boolean>;
};

/**
 * `exclusive` is a hero's skin: picking one puts the others away. `toggle` is
 * everything that stacks - extras, and skins once the user allows several at
 * once - where a pick only turns the one entry on or off.
 */
export type SelectionMode = "exclusive" | "toggle";

export type HeroSelectionResult = "applied" | "aborted" | "noop";

/** What should be installed for a hero after clicking `target`. */
export function nextHeroSelection<T extends { remoteId: string }>(
  active: T[],
  target: T | null,
  mode: SelectionMode,
): T[] {
  if (target === null) {
    return [];
  }
  if (mode === "exclusive") {
    return [target];
  }
  return active.some((mod) => mod.remoteId === target.remoteId)
    ? active.filter((mod) => mod.remoteId !== target.remoteId)
    : [...active, target];
}

/**
 * Brings a hero from `active` to `next`. Removals run first, so a swap never has
 * two skins installed at the same time, and a failed step stops the rest rather
 * than leaving the hero half-changed.
 */
export async function applyHeroSelection<T extends { remoteId: string }>(
  active: T[],
  next: T[],
  deps: HeroSelectionDeps<T>,
): Promise<HeroSelectionResult> {
  const wanted = new Set(next.map((mod) => mod.remoteId));
  const installed = new Set(active.map((mod) => mod.remoteId));

  const toRemove = active.filter((mod) => !wanted.has(mod.remoteId));
  const toInstall = next.filter((mod) => !installed.has(mod.remoteId));

  if (toRemove.length === 0 && toInstall.length === 0) {
    return "noop";
  }

  for (const mod of toRemove) {
    if (!(await deps.uninstall(mod))) {
      return "aborted";
    }
  }
  for (const mod of toInstall) {
    if (!(await deps.install(mod))) {
      return "aborted";
    }
  }

  return "applied";
}
