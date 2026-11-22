export type HeroSelectionDeps<T> = {
  uninstall: (mod: T) => Promise<boolean>;
  install: (mod: T) => Promise<boolean>;
};

export type SelectionMode = "exclusive" | "toggle";

export type HeroSelectionResult = "applied" | "aborted" | "noop";

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
