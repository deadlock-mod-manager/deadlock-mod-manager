import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

export async function getTempDir(): Promise<string> {
  const customTempDir = "/app/temp";

  try {
    await mkdir(customTempDir, { recursive: true });
    return resolve(customTempDir);
  } catch {
    return tmpdir();
  }
}
