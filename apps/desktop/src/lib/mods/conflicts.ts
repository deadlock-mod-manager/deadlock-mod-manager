import type { ConflictFile } from "@/types/generated/ConflictFile";
import type { ConflictSeverity } from "@/types/generated/ConflictSeverity";
import type { ModConflict } from "@/types/generated/ModConflict";
import type { LocalMod } from "@/types/mods";
import { isInstalledModWithVpks } from "./installed-helpers";

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

export interface ConflictGroup {
  key: string;
  providers: string[];
  severity: ConflictSeverity;
  files: ConflictFile[];
  pairs: [string, string][];
}

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
