import { ProviderError } from "@deadlock-mods/common";

export type UpdateCheckOutcome<Update> =
  | { kind: "available"; update: Update }
  | { kind: "noUpdate" }
  | { kind: "targetUnavailable"; message: string };

export type ExactUpdateCheckOptions = {
  target: string;
  allowDowngrades: false;
};

export const buildExactUpdateCheckOptions = (
  target: string,
): ExactUpdateCheckOptions => ({
  target,
  allowDowngrades: false,
});

export async function checkExactUpdate<Update>(
  manifestTarget: string,
  check: (manifestTarget: string) => Promise<Update | null>,
): Promise<UpdateCheckOutcome<Update>> {
  try {
    const update = await check(manifestTarget);
    return update ? { kind: "available", update } : { kind: "noUpdate" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("platform") && message.includes("not found")) {
      return { kind: "targetUnavailable", message };
    }

    throw new ProviderError(
      `Update check failed for target ${manifestTarget}`,
      error,
    );
  }
}

export async function installExactUpdate(
  install: () => Promise<void>,
): Promise<void> {
  try {
    await install();
  } catch (error) {
    throw new ProviderError("Update installation failed", error);
  }
}
