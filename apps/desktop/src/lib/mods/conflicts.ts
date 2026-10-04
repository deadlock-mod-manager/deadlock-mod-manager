import type { ConflictFile } from "@/types/generated/ConflictFile";
import type { ConflictSeverity } from "@/types/generated/ConflictSeverity";
import type { ModConflict } from "@/types/generated/ModConflict";
import type { LocalMod } from "@/types/mods";
import { isInstalledModWithVpks } from "./installed-helpers";

/**
 * Load order that makes `newWinner` win against `currentWinner`: `newWinner`
 * moves directly in front of `currentWinner` and everything else keeps its
 * relative position.
 */
export function orderWithWinner(
  orderedIds: readonly string[],
  newWinner: string,
  currentWinner: string,
): string[] {
  const winnerIndex = orderedIds.indexOf(newWinner);
  const currentIndex = orderedIds.indexOf(currentWinner);
  if (winnerIndex === -1 || currentIndex === -1 || winnerIndex < currentIndex) {
    return [...orderedIds];
  }
  const order = orderedIds.filter((id) => id !== newWinner);
  order.splice(currentIndex, 0, newWinner);
  return order;
}

/**
 * Changes whenever the enabled mods, their files, or their load order change,
 * so conflict results are refetched after any of those.
 */
export function enabledModsSignature(
  mods: readonly Pick<
    LocalMod,
    "remoteId" | "status" | "installedVpks" | "installOrder"
  >[],
): string {
  return mods
    .filter(isInstalledModWithVpks)
    .map(
      (mod) =>
        `${mod.remoteId}:${mod.installOrder ?? ""}:${(mod.installedVpks ?? []).join(",")}`,
    )
    .sort()
    .join("|");
}

const SEVERITY_RANK = { low: 0, normal: 1, critical: 2 } satisfies Record<
  ConflictSeverity,
  number
>;

/** Files that the same set of mods all ship, with those mods in load order. */
export interface ConflictGroup {
  key: string;
  /** Mods providing these files; the first one is used in game. */
  providers: string[];
  severity: ConflictSeverity;
  files: ConflictFile[];
  /** Every conflicting pair among the providers, as `[winner, loser]`. */
  pairs: [string, string][];
}

/**
 * Regroups pairwise conflicts by the exact set of mods that ship each file, so
 * three mods replacing one model read as one row instead of three pairs.
 */
export function groupConflicts(
  conflicts: readonly ModConflict[],
): ConflictGroup[] {
  const byPath = new Map<
    string,
    { file: ConflictFile; providers: Set<string> }
  >();
  for (const conflict of conflicts) {
    for (const file of conflict.files) {
      const entry = byPath.get(file.path) ?? { file, providers: new Set() };
      entry.providers.add(conflict.winner);
      entry.providers.add(conflict.loser);
      byPath.set(file.path, entry);
    }
  }

  const groups = new Map<
    string,
    { providers: string[]; files: ConflictFile[] }
  >();
  for (const { file, providers } of byPath.values()) {
    const sorted = [...providers].sort();
    const key = sorted.join("|");
    const group = groups.get(key) ?? { providers: sorted, files: [] };
    group.files.push(file);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, { providers, files }]) => {
      const members = new Set(providers);
      const pairs = conflicts
        .filter(
          ({ winner, loser }) => members.has(winner) && members.has(loser),
        )
        .map(({ winner, loser }): [string, string] => [winner, loser]);
      const losses = (modId: string) =>
        pairs.filter(([, loser]) => loser === modId).length;
      const severity = files.reduce<ConflictSeverity>(
        (worst, file) =>
          SEVERITY_RANK[file.severity] > SEVERITY_RANK[worst]
            ? file.severity
            : worst,
        "low",
      );
      return {
        key,
        providers: [...providers].sort((a, b) => losses(a) - losses(b)),
        severity,
        files: [...files].sort(
          (a, b) =>
            SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
            a.path.localeCompare(b.path),
        ),
        pairs,
      };
    })
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.files.length - a.files.length ||
        a.key.localeCompare(b.key),
    );
}

export type ModConflictStatus = "modelHidden" | "overlap";

/**
 * How each mod is affected: `modelHidden` when another mod's copy of a model
 * it ships is used instead, `overlap` when it only shares less visible files.
 */
export function conflictStatusByMod(
  groups: readonly ConflictGroup[],
): Map<string, ModConflictStatus> {
  const status = new Map<string, ModConflictStatus>();
  for (const group of groups) {
    for (const [position, modId] of group.providers.entries()) {
      if (group.severity === "critical" && position > 0) {
        status.set(modId, "modelHidden");
      } else if (!status.has(modId)) {
        status.set(modId, "overlap");
      }
    }
  }
  return status;
}
