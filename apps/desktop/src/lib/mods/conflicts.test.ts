import { describe, expect, it } from "bun:test";
import type { ConflictFile } from "@/types/generated/ConflictFile";
import type { ModConflict } from "@/types/generated/ModConflict";
import { ModStatus } from "@/types/mods";
import {
  conflictStatusByMod,
  enabledModsSignature,
  groupConflicts,
  orderWithWinner,
} from "./conflicts";

const conflict = (
  winner: string,
  loser: string,
  files: ModConflict["files"] = [{ path: "x.vmat_c", severity: "normal" }],
): ModConflict => ({
  winner,
  loser,
  severity: "normal",
  files,
});

const model: ConflictFile = { path: "models/hat.vmdl_c", severity: "critical" };
const material: ConflictFile = {
  path: "materials/hat.vmat_c",
  severity: "normal",
};

describe("groupConflicts", () => {
  it("merges the pairs of three mods sharing one file into one ranked group", () => {
    const groups = groupConflicts([
      conflict("b", "c", [model]),
      conflict("a", "b", [model]),
      conflict("a", "c", [model]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].providers).toEqual(["a", "b", "c"]);
    expect(groups[0].severity).toBe("critical");
    expect(groups[0].pairs).toHaveLength(3);
  });

  it("splits files by the exact set of mods that ship them", () => {
    const groups = groupConflicts([
      conflict("a", "b", [model, material]),
      conflict("a", "c", [material]),
      conflict("b", "c", [material]),
    ]);
    expect(
      groups.map((group) => [group.providers, group.files.map((f) => f.path)]),
    ).toEqual([
      [["a", "b"], ["models/hat.vmdl_c"]],
      [["a", "b", "c"], ["materials/hat.vmat_c"]],
    ]);
  });
});

describe("orderWithWinner", () => {
  it("moves the new winner directly in front of the current winner", () => {
    expect(orderWithWinner(["a", "b", "c", "d"], "d", "b")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("keeps the order when the mod already loads first", () => {
    expect(orderWithWinner(["a", "b", "c"], "a", "c")).toEqual(["a", "b", "c"]);
  });

  it("leaves the order alone when either mod is not enabled", () => {
    expect(orderWithWinner(["a", "b"], "x", "a")).toEqual(["a", "b"]);
    expect(orderWithWinner(["a", "b"], "a", "x")).toEqual(["a", "b"]);
  });
});

describe("conflictStatusByMod", () => {
  it("marks mods whose model is not used, and everyone else as overlapping", () => {
    const status = conflictStatusByMod(
      groupConflicts([
        conflict("a", "b", [model]),
        conflict("b", "c", [material]),
      ]),
    );
    expect(Object.fromEntries(status)).toEqual({
      a: "overlap",
      b: "modelHidden",
      c: "overlap",
    });
  });
});

type SignatureMod = Parameters<typeof enabledModsSignature>[0][number];
const mod = (overrides: Partial<SignatureMod>): SignatureMod => ({
  remoteId: "1",
  status: ModStatus.Installed,
  installedVpks: ["pak01_dir.vpk"],
  installOrder: 0,
  ...overrides,
});

describe("enabledModsSignature", () => {
  it("ignores disabled mods and changes with load order", () => {
    const base = [
      mod({}),
      mod({ remoteId: "2", status: ModStatus.Downloaded }),
    ];
    const reordered = [mod({ installedVpks: ["pak02_dir.vpk"] })];
    expect(enabledModsSignature(base)).toBe(enabledModsSignature([mod({})]));
    expect(enabledModsSignature(base)).not.toBe(
      enabledModsSignature(reordered),
    );
  });
});
