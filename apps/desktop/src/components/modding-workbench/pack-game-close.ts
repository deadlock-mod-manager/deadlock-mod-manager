export interface PackGameCloseDependencies {
  isRunning: () => Promise<boolean>;
  confirmClose: () => Promise<boolean>;
  stop: () => Promise<void>;
  wait: () => Promise<void>;
  onStopping: () => void;
}

export type PackGameCloseResult = "ready" | "cancelled" | "still-running";

export async function closeGameForPack(
  dependencies: PackGameCloseDependencies,
): Promise<PackGameCloseResult> {
  if (!(await dependencies.isRunning())) return "ready";
  if (!(await dependencies.confirmClose())) return "cancelled";
  dependencies.onStopping();
  await dependencies.stop();
  for (let attempt = 0; attempt < 40; attempt++) {
    if (!(await dependencies.isRunning())) return "ready";
    await dependencies.wait();
  }
  return (await dependencies.isRunning()) ? "still-running" : "ready";
}
