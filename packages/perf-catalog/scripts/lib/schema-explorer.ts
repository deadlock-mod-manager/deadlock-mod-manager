import { z } from "zod";
import type { ConvarMeta } from "../../src/schema";

/** The parts of SchemaExplorer's `schemas/deadlock.json` the catalog reads. */
export const schemaHeaderSchema = z.object({
  revision: z.number().int(),
  version_date: z.string(),
});

export const schemaDumpSchema = schemaHeaderSchema.extend({
  convars: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      default: z.string().optional(),
      min: z.string().optional(),
      max: z.string().optional(),
      flags: z.array(z.string()).optional(),
      help: z.string().optional(),
      enum: z.string().optional(),
    }),
  ),
  commands: z.array(z.object({ name: z.string() })),
  enums: z.array(
    z.object({
      name: z.string(),
      members: z.array(z.object({ name: z.string(), value: z.number() })),
    }),
  ),
});

type SchemaDump = z.infer<typeof schemaDumpSchema>;

type ConvarFacts = Pick<
  ConvarMeta,
  "name" | "kind" | "default" | "min" | "max" | "enumValues" | "flags" | "help"
>;

const INT_TYPES = new Set([
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
]);
const FLOAT_TYPES = new Set(["float32", "float64"]);
const VECTOR_TYPES = new Set([
  "vector2",
  "vector3",
  "vector4",
  "qangle",
  "vector_ws",
]);

const kindOf = (type: string, isEnum: boolean): ConvarMeta["kind"] => {
  if (isEnum) return "enum";
  if (type === "bool") return "bool";
  if (INT_TYPES.has(type)) return "int";
  if (FLOAT_TYPES.has(type)) return "float";
  if (type === "color") return "color";
  if (VECTOR_TYPES.has(type)) return "vector";
  return "string";
};

const number = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Floats print with six decimals in the dump; `0.500000` reads better as `0.5`. */
const tidyDefault = (
  value: string | undefined,
  kind: ConvarMeta["kind"],
): string | undefined => {
  if (value === undefined) return undefined;
  if (kind === "float" || kind === "int") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return String(parsed);
  }
  return value;
};

const ENUM_ITEM = /(?:^|[\s,;(])(-?\d+)\s*(?:=|:|\s-\s)\s*/g;

/**
 * Values an int convar's help text enumerates ("0 = Off, 1 = Low, 2 = High").
 * Conservative: at least two distinct values, short labels, nothing else.
 */
const enumFromHelp = (
  help: string,
): { value: string; label: string }[] | undefined => {
  const matches = [...help.matchAll(ENUM_ITEM)];
  if (matches.length < 2) return undefined;
  const items: { value: string; label: string }[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match[0].length;
    const end =
      index + 1 < matches.length ? matches[index + 1].index : help.length;
    const label = help
      .slice(start, end)
      .split(/[.;)\n]|,\s/)[0]
      .trim()
      .replace(/[,\s]+$/, "");
    if (!label || label.length > 40) return undefined;
    items.push({ value: match[1], label });
  }
  const values = new Set(items.map((item) => item.value));
  if (values.size !== items.length) return undefined;
  return items;
};

export const convarFacts = (dump: SchemaDump): ConvarFacts[] => {
  const enums = new Map(dump.enums.map((entry) => [entry.name, entry]));
  return dump.convars.map((convar) => {
    const kind = kindOf(convar.type, Boolean(convar.enum));
    const help = convar.help?.trim() || undefined;
    let enumValues: ConvarFacts["enumValues"];
    if (convar.enum) {
      enumValues = enums
        .get(convar.enum)
        ?.members.map((member) => ({ value: member.name, label: member.name }));
    } else if (kind === "int" && help) {
      enumValues = enumFromHelp(help);
    }
    const flags = [...(convar.flags ?? [])].sort();
    return {
      name: convar.name,
      kind,
      default: tidyDefault(convar.default, kind),
      min: number(convar.min),
      max: number(convar.max),
      enumValues: enumValues && enumValues.length > 0 ? enumValues : undefined,
      flags: flags.length > 0 ? flags : undefined,
      help,
    };
  });
};
