import {
  lstat,
  mkdir,
  readdir,
  readlink,
  unlink,
  symlink,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function statLink(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function linkClaudeSkills(workspace = root) {
  const source = join(workspace, ".agents", "skills");
  const destination = join(workspace, ".claude", "skills");
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(destination, { recursive: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = join(source, entry.name);
    const link = join(destination, entry.name);
    const stats = await statLink(link);
    if (stats && !stats.isSymbolicLink()) {
      throw new Error(
        `Skill path is not a link; preserve and move it manually: ${link}`,
      );
    }
    if (stats) {
      const existing = resolve(destination, await readlink(link));
      if (existing === target) continue;
      await unlink(link);
    }
    await symlink(
      process.platform === "win32"
        ? target
        : join("..", "..", ".agents", "skills", entry.name),
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await linkClaudeSkills();
}
