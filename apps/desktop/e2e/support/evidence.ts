import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const captureEvidence = async (
  directory: string,
  captures: Record<string, () => Promise<void>>,
): Promise<string[]> => {
  await mkdir(directory, { recursive: true });
  const failures: string[] = [];
  for (const [name, capture] of Object.entries(captures)) {
    try {
      await capture();
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.stack : String(error)}`,
      );
    }
  }
  if (failures.length)
    await writeFile(
      path.join(directory, "capture-errors.json"),
      JSON.stringify(failures, null, 2),
    );
  return failures;
};

export const step = async <T>(
  name: string,
  action: () => Promise<T>,
): Promise<T> => {
  const directory = process.env.DMM_E2E_ARTIFACTS;
  if (!directory) throw new Error("DMM_E2E_ARTIFACTS is required for steps");
  const started = Date.now();
  const record = async (status: string, error?: string) =>
    appendFile(
      path.join(directory, "steps.ndjson"),
      JSON.stringify({
        phase: process.env.DMM_E2E_PHASE,
        name,
        status,
        at: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        error,
      }) + "\n",
    );
  await record("started");
  try {
    const value = await action();
    await record("passed");
    return value;
  } catch (error) {
    await record(
      "failed",
      error instanceof Error ? error.message : String(error),
    ).catch((captureError: Error) =>
      console.error("Could not record failed step", captureError),
    );
    throw error;
  }
};
