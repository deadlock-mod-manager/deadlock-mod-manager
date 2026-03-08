import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const soulPath = resolve(fileURLToPath(import.meta.url), "..", "soul.md");
export const SOUL_INSTRUCTIONS = readFileSync(soulPath, "utf-8");
