import type { ModDependency, ModDto } from "@deadlock-mods/shared";

export type { ModDependency } from "@deadlock-mods/shared";

/**
 * A dependency once we've looked it up. Internal means we have the mod and can
 * show a card for it. External means we can'tt: a tool, a mod we don't have, a
 * note, or a link somewhere else
 */
export type ResolvedDependency =
  | {
      kind: "internal";
      dependency: ModDependency;
      mod: ModDto;
    }
  | {
      kind: "external";
      dependency: ModDependency;
    };
