import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string[]} files */
export function requiresDesktopE2E(files) {
  return files.some(
    (file) =>
      file.startsWith("apps/desktop/") ||
      file.startsWith("packages/") ||
      file.startsWith("tools/") ||
      file.startsWith(".github/actions/setup-desktop-e2e/") ||
      [
        ".github/workflows/ci.yml",
        ".github/workflows/desktop-e2e.yml",
        "scripts/select-critical-e2e.mjs",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "turbo.json",
        "turbo.jsonc",
        ".npmrc",
        ".nvmrc",
        ".bun-version",
        "rust-toolchain.toml",
        "flake.nix",
        "flake.lock",
        "package.nix",
      ].includes(file),
  );
}

/** @param {string | undefined} base @param {string | undefined} head */
export function changedFiles(base, head) {
  // Dispatches and the first push have no comparison base: run coverage.
  if (!base || /^0+$/.test(base)) return null;
  if (!/^[a-f0-9]{40}$/i.test(base) || !/^[a-f0-9]{40}$/i.test(head ?? ""))
    throw new Error("Expected base and head commit SHAs");
  return execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`, "--"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const files = changedFiles(process.env.BASE_SHA, process.env.HEAD_SHA);
  const required = files === null || requiresDesktopE2E(files);
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(process.env.GITHUB_OUTPUT, `required=${required}\n`);
  console.info(`Critical desktop E2E required: ${required}`);
}
