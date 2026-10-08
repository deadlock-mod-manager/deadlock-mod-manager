import { describe, expect, it } from "bun:test";
import {
  ConvarTokenError,
  hasDuplicateConvarName,
  parseConvarDocument,
  parseConvars,
  serializeConvarDocument,
} from "./gameinfo-convars";

const SAMPLE = `
// Networking
"rate"
{
  // keep me
  "min" "98304"
  "default" "786432"
}
"fps_max" "400"
"sv_minrate" "98304" // kept out of the value
`;

describe("gameinfo convars", () => {
  it("parses flat values and one-level groups, skipping comments", () => {
    expect(
      parseConvars(SAMPLE).map((row) => [row.parent, row.name, row.value]),
    ).toEqual([
      ["rate", "min", "98304"],
      ["rate", "default", "786432"],
      [null, "fps_max", "400"],
      [null, "sv_minrate", "98304"],
    ]);
  });

  it("keeps comments and untouched entries when one value changes", () => {
    const document = parseConvarDocument(SAMPLE);
    const rows = document.rows.map((row) =>
      row.name === "fps_max" ? { ...row, value: "0" } : row,
    );
    const saved = serializeConvarDocument(document, rows);
    expect(saved).toContain("// Networking");
    expect(saved).toContain("// keep me");
    expect(saved).toContain("// kept out of the value");
    expect(saved).toContain('"fps_max" "0"');
    expect(saved).toContain('"min" "98304"');
  });

  it("keeps text the editor cannot show", () => {
    const document = parseConvarDocument(`${SAMPLE}\n{ not a convar`);
    expect(document.opaque).toBe(true);
    expect(serializeConvarDocument(document, document.rows)).toContain(
      "{ not a convar",
    );
  });

  it("treats rate.max and RATE.max as the same name", () => {
    expect(hasDuplicateConvarName(["rate.min", "rate.max"])).toBe(false);
    expect(hasDuplicateConvarName(["rate.max", "RATE.max"])).toBe(true);
  });

  it("keeps a slash comment inside the value when that value changes again", () => {
    const document = parseConvarDocument('"url" "http://example"');
    const once = document.rows.map((row) => ({
      ...row,
      value: "http://other",
    }));
    const saved = serializeConvarDocument(document, once);
    expect(saved).toBe('"url" "http://other"');
    const again = parseConvarDocument(saved);
    const twice = again.rows.map((row) => ({ ...row, value: "done" }));
    expect(serializeConvarDocument(again, twice)).toBe('"url" "done"');
  });

  it("keeps a same-line comment on a sibling when a group value changes", () => {
    const text = '"rate"\n{\n"min" "1" // floor\n"max" "9"\n}';
    const document = parseConvarDocument(text);
    const rows = document.rows.map((row) =>
      row.name === "max" ? { ...row, value: "8" } : row,
    );
    const saved = serializeConvarDocument(document, rows);
    expect(saved).toContain("// floor");
    expect(saved).toContain('"max" "8"');
  });

  it("rejects quotes instead of deleting them", () => {
    const document = parseConvarDocument('"fps_max" "400"');
    const rows = document.rows.map((row) => ({ ...row, value: '1"2' }));
    expect(() => serializeConvarDocument(document, rows)).toThrow(
      ConvarTokenError,
    );
  });
});
