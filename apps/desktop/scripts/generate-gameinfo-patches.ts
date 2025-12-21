#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type DocumentDiff,
  generateDiff,
  type KeyValuesObject,
  parseKv,
} from "@deadlock-mods/kv-parser-rs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_URL =
  process.env.API_URL ||
  "https://api.deadlockmods.app/artifacts/deadlock/gameinfo.gi";
const PATCHES_DIR = join(__dirname, "..", "patches");

async function fetchVanillaGameinfo(): Promise<string> {
  if (process.env.GAMEINFO_FILE) {
    console.log(
      `Reading vanilla gameinfo.gi from ${process.env.GAMEINFO_FILE}...`,
    );
    return readFile(process.env.GAMEINFO_FILE, "utf-8");
  }
  console.log(`Fetching vanilla gameinfo.gi from ${API_URL}...`);
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch gameinfo.gi: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

function getSearchPaths(data: KeyValuesObject): KeyValuesObject | null {
  const gameInfo = data.GameInfo as KeyValuesObject | undefined;
  if (!gameInfo) return null;

  const fileSystem = gameInfo.FileSystem as KeyValuesObject | undefined;
  if (!fileSystem) return null;

  return fileSystem.SearchPaths as KeyValuesObject | null;
}

function createModdedSearchPaths(
  vanillaSearchPaths: KeyValuesObject,
): KeyValuesObject {
  const modded: KeyValuesObject = {};

  // Preserve Game_Language at the top
  for (const [key, value] of Object.entries(vanillaSearchPaths)) {
    if (key === "Game_Language") {
      modded[key] = value;
    }
  }

  // Create the modded search paths with proper interspersed entries
  // Each system (citadel and core) gets its own Game, Mod, and Write entries
  modded.Game = ["citadel/addons/{{PROFILE}}", "citadel", "core"];
  modded.Mod = ["citadel", "core"];
  modded.Write = ["citadel", "core"];

  return modded;
}

function createModdedData(vanillaData: KeyValuesObject): KeyValuesObject {
  const modded = structuredClone(vanillaData);
  const gameInfo = modded.GameInfo as KeyValuesObject;
  const fileSystem = gameInfo.FileSystem as KeyValuesObject;
  const vanillaSearchPaths = fileSystem.SearchPaths as KeyValuesObject;

  fileSystem.SearchPaths = createModdedSearchPaths(vanillaSearchPaths);

  return modded;
}

function reverseDiff(diff: DocumentDiff): DocumentDiff {
  return {
    changes: diff.changes.map((entry) => ({
      ...entry,
      op:
        entry.op === "add"
          ? "remove"
          : entry.op === "remove"
            ? "add"
            : "replace",
      oldValue: entry.newValue,
      newValue: entry.oldValue,
    })),
  };
}

async function main() {
  const vanillaContent = await fetchVanillaGameinfo();
  console.log("Parsing vanilla gameinfo.gi...");

  const { data: vanillaData } = parseKv(vanillaContent);

  const vanillaSearchPaths = getSearchPaths(vanillaData);
  if (!vanillaSearchPaths) {
    throw new Error("Could not find SearchPaths in vanilla gameinfo.gi");
  }

  console.log(
    "Vanilla SearchPaths:",
    JSON.stringify(vanillaSearchPaths, null, 2),
  );

  const moddedData = createModdedData(vanillaData);
  const moddedSearchPaths = getSearchPaths(moddedData);

  console.log(
    "Modded SearchPaths:",
    JSON.stringify(moddedSearchPaths, null, 2),
  );

  console.log("Generating enable-mods diff...");
  const enableDiff = generateDiff(vanillaData, moddedData);

  // Add mod manager markers to enable-mods patch
  // Note: The comment value should match what has_mod_manager_markers() checks for
  const markerStart = "Deadlock Mod Manager - Start";
  const markerEnd = "Deadlock Mod Manager - End";

  // Reorder changes: comments should be added FIRST, before other modifications
  // This ensures the "Start" comment goes before Game entries and "End" goes after everything
  const commentChanges = [
    {
      op: "add" as const,
      path: "GameInfo.FileSystem.SearchPaths.Game",
      oldValue: null,
      newValue: null,
      comment: markerStart,
      commentPosition: "before" as const,
    },
    {
      op: "add" as const,
      path: "GameInfo.FileSystem.SearchPaths.Game",
      oldValue: null,
      newValue: null,
      comment: markerEnd,
      commentPosition: "after" as const,
    },
  ];

  // Put comments at the beginning so they're applied first
  enableDiff.changes = [...commentChanges, ...enableDiff.changes];

  console.log("Generating disable-mods diff...");
  const disableDiff = reverseDiff(enableDiff);
  // Note: reverseDiff already reverses the marker operations (add -> remove)

  console.log(`Creating patches directory: ${PATCHES_DIR}`);
  await mkdir(PATCHES_DIR, { recursive: true });

  const enablePatchPath = join(PATCHES_DIR, "enable-mods.patch.json");
  const disablePatchPath = join(PATCHES_DIR, "disable-mods.patch.json");

  console.log(`Writing ${enablePatchPath}...`);
  await writeFile(enablePatchPath, JSON.stringify(enableDiff, null, 2));

  console.log(`Writing ${disablePatchPath}...`);
  await writeFile(disablePatchPath, JSON.stringify(disableDiff, null, 2));

  console.log("\nGenerated patches:");
  console.log(
    `  - enable-mods.patch.json (${enableDiff.changes.length} changes)`,
  );
  console.log(
    `  - disable-mods.patch.json (${disableDiff.changes.length} changes)`,
  );

  console.log("\nEnable diff changes:");
  for (const change of enableDiff.changes) {
    console.log(
      `  ${change.op}: ${change.path}${change.comment ? ` [comment: ${change.comment}]` : ""}`,
    );
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Failed to generate patches:", error);
    process.exit(1);
  });
}
