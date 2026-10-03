import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function checkToolchain(workspace = root) {
  const read = (path) => readFile(join(workspace, path), "utf8");
  const pkg = JSON.parse(await read("package.json"));
  const node = (await read(".nvmrc")).trim();
  const bun = (await read(".bun-version")).trim();
  const ci = await read(".github/workflows/ci.yml");
  const errors = [];
  for (const [label, version] of [
    ["Node", node],
    ["Bun", bun],
  ]) {
    if (!/^\d+\.\d+\.\d+$/.test(version))
      errors.push(`${label} pin must be an exact version`);
  }
  if (pkg.engines?.node !== `>=${node}`)
    errors.push("Node engine differs from .nvmrc");
  if (pkg.engines?.bun !== `>=${bun}`)
    errors.push("Bun engine differs from .bun-version");
  if (
    !/^pnpm@\d+\.\d+\.\d+(?:\+sha512\.[a-f0-9]+)?$/.test(
      pkg.packageManager ?? "",
    )
  )
    errors.push("packageManager must pin pnpm");
  const ciNode = ci.match(/NODE_VERSION:\s*["']?([^\s"'#]+)/)?.[1];
  if (ciNode !== node) errors.push("CI Node version differs from .nvmrc");
  const ciBun = [...ci.matchAll(/bun-version:\s*["']?([^\s"'#]+)/g)];
  if (ciBun.length === 0 || ciBun.some((match) => match[1] !== bun))
    errors.push("CI Bun versions differ from .bun-version");
  if (errors.length) throw new Error(errors.join("\n"));
  return { node, bun, pnpm: pkg.packageManager.split("+")[0] };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.info(await checkToolchain());
}
