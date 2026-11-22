import type { ModDependency, ModDto } from "@deadlock-mods/shared";

export type { ModDependency } from "@deadlock-mods/shared";

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
