import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

/**
 * Get the temporary directory path for lockdex
 * Uses /app/temp if it exists, otherwise falls back to system tmpdir
 */
export async function getTempDir(): Promise<string> {
  const customTempDir = "/app/temp";

  try {
    // Check if /app/temp exists and is accessible
    await mkdir(customTempDir, { recursive: true });
    return customTempDir;
  } catch {
    // Fall back to system tmpdir if /app/temp is not available
    return tmpdir();
  }
}
