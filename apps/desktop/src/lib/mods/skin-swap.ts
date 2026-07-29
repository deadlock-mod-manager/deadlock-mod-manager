export type SkinSwapDeps<T> = {
  /** Returns false when the uninstall did not take effect; the swap aborts. */
  uninstall: (mod: T) => Promise<boolean>;
  /** Returns false when the install did not succeed; the swap aborts. */
  install: (mod: T) => Promise<boolean>;
};

export type SkinSwapResult = "swapped" | "reset" | "aborted" | "noop";

export async function swapHeroSkin<T extends { remoteId: string }>(
  activeSkins: T[],
  target: T | null,
  deps: SkinSwapDeps<T>,
): Promise<SkinSwapResult> {
  const targetIsActive =
    target !== null &&
    activeSkins.some((mod) => mod.remoteId === target.remoteId);

  if (targetIsActive && activeSkins.length === 1) {
    return "noop";
  }

  const toRemove = activeSkins.filter(
    (mod) => mod.remoteId !== target?.remoteId,
  );
  for (const mod of toRemove) {
    const uninstalled = await deps.uninstall(mod);
    if (!uninstalled) {
      return "aborted";
    }
  }

  if (target === null) {
    return "reset";
  }
  if (!targetIsActive) {
    const installed = await deps.install(target);
    if (!installed) {
      return "aborted";
    }
  }
  return "swapped";
}
