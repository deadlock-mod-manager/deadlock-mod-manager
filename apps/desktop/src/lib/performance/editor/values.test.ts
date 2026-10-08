import { describe, expect, test } from "bun:test";
import type { ConvarMeta } from "@/types/generated/ConvarMeta";
import {
  checkRange,
  clampToRange,
  controlKind,
  describeValue,
  entryKeyLabel,
  formatBool,
  formatNumber,
  initialValueFor,
  numericStep,
  parseBool,
  parseNumber,
  sameValue,
} from "./values";

const meta = (overrides: Partial<ConvarMeta> = {}): ConvarMeta => ({
  name: "r_test",
  kind: "int",
  default: null,
  min: null,
  max: null,
  step: null,
  enumValues: [],
  flags: [],
  help: null,
  label: null,
  description: null,
  category: "other",
  gameplay: null,
  sideEffects: null,
  status: "active",
  statusSinceBuild: null,
  ...overrides,
});

describe("bools", () => {
  test("accepts 0/1 and true/false in any case", () => {
    expect(parseBool("1")).toBe(true);
    expect(parseBool(" TRUE ")).toBe(true);
    expect(parseBool("0")).toBe(false);
    expect(parseBool("False")).toBe(false);
    expect(parseBool("2")).toBeNull();
    expect(parseBool("")).toBeNull();
  });

  test("writes back in the config's style", () => {
    expect(formatBool(true, "false")).toBe("true");
    expect(formatBool(false, "TRUE")).toBe("false");
    expect(formatBool(true, "0")).toBe("1");
    expect(formatBool(false, null)).toBe("0");
  });
});

describe("numbers", () => {
  test("parses ints and rejects fractions", () => {
    expect(parseNumber("128", "int")).toEqual({ ok: true, value: 128 });
    expect(parseNumber("-3", "int")).toEqual({ ok: true, value: -3 });
    expect(parseNumber("0.25", "int")).toEqual({
      ok: false,
      error: "notAnInteger",
    });
  });

  test("parses floats in the forms configs use", () => {
    expect(parseNumber("0.25", "float")).toEqual({ ok: true, value: 0.25 });
    expect(parseNumber(".5", "float")).toEqual({ ok: true, value: 0.5 });
    expect(parseNumber("1e3", "float")).toEqual({ ok: true, value: 1000 });
  });

  test("rejects empty and non-numeric text", () => {
    expect(parseNumber("  ", "float")).toEqual({ ok: false, error: "empty" });
    expect(parseNumber("abc", "float")).toEqual({
      ok: false,
      error: "notANumber",
    });
    expect(parseNumber("0x10", "int")).toEqual({
      ok: false,
      error: "notANumber",
    });
    expect(parseNumber("1.2.3", "float")).toEqual({
      ok: false,
      error: "notANumber",
    });
  });

  test("formats without float noise", () => {
    expect(formatNumber(0.1 + 0.2, "float")).toBe("0.3");
    expect(formatNumber(2, "float")).toBe("2");
    expect(formatNumber(2.6, "int")).toBe("3");
  });

  test("step comes from the catalog, else from the kind and range", () => {
    expect(numericStep(meta({ step: 0.5, kind: "float" }))).toBe(0.5);
    expect(numericStep(meta({ kind: "int", min: 0, max: 4096 }))).toBe(1);
    expect(numericStep(meta({ kind: "float", min: 0, max: 1 }))).toBe(0.01);
    expect(numericStep(meta({ kind: "float", min: 0, max: 10 }))).toBe(0.1);
    expect(numericStep(meta({ kind: "float", min: 0, max: 5000 }))).toBe(1);
    expect(numericStep(meta({ kind: "float" }))).toBe(0.01);
  });

  test("reports which bound a value crosses", () => {
    const range = meta({ min: 128, max: 4096 });
    expect(checkRange(16, range)).toEqual({
      within: false,
      bound: "min",
      limit: 128,
    });
    expect(checkRange(8192, range)).toEqual({
      within: false,
      bound: "max",
      limit: 4096,
    });
    expect(checkRange(1024, range)).toEqual({ within: true });
    expect(clampToRange(16, range)).toBe(128);
    expect(clampToRange(16, meta())).toBe(16);
  });
});

describe("controlKind", () => {
  test("picks a control from the convar kind", () => {
    expect(controlKind(meta({ kind: "bool" }), "1")).toBe("switch");
    expect(controlKind(meta({ kind: "int", min: 0, max: 15 }), "3")).toBe(
      "slider",
    );
    expect(controlKind(meta({ kind: "int" }), "3")).toBe("number");
    expect(controlKind(meta({ kind: "string" }), "abc")).toBe("text");
    expect(controlKind(meta({ kind: "color" }), "255 0 0")).toBe("text");
    expect(controlKind(meta({ kind: "vector" }), "0 0 1")).toBe("text");
  });

  test("uses a select whenever the convar lists its values", () => {
    expect(
      controlKind(
        meta({ kind: "int", enumValues: [{ value: "0", label: "Off" }] }),
        "0",
      ),
    ).toBe("select");
  });

  test("skips the slider for huge ranges", () => {
    expect(
      controlKind(meta({ kind: "int", min: 0, max: 2_147_483_647 }), "5"),
    ).toBe("number");
  });

  test("falls back to text when the value doesn't fit the kind", () => {
    expect(controlKind(meta({ kind: "bool" }), "2")).toBe("text");
    expect(controlKind(meta({ kind: "float" }), "fast")).toBe("text");
    expect(controlKind(null, "4")).toBe("text");
  });
});

describe("sameValue", () => {
  test("compares by meaning for the kind", () => {
    expect(sameValue("1", "true", "bool")).toBe(true);
    expect(sameValue("0", "true", "bool")).toBe(false);
    expect(sameValue("2", "2.0", "float")).toBe(true);
    expect(sameValue("2", "3", "int")).toBe(false);
    expect(sameValue("abc", "abc ", "string")).toBe(true);
    expect(sameValue("1", "true", null)).toBe(false);
  });
});

describe("describeValue", () => {
  test("shows bools as on/off and enums by label", () => {
    expect(describeValue("0", meta({ kind: "bool" }))).toEqual({
      kind: "bool",
      on: false,
    });
    expect(
      describeValue(
        "2",
        meta({ kind: "enum", enumValues: [{ value: "2", label: "High" }] }),
      ),
    ).toEqual({ kind: "enum", label: "High" });
    expect(describeValue("16", meta())).toEqual({ kind: "raw", text: "16" });
  });
});

describe("initialValueFor", () => {
  test("prefers the code default", () => {
    expect(initialValueFor(meta({ default: "1024" }))).toBe("1024");
  });

  test("picks something valid without a default", () => {
    expect(initialValueFor(meta({ kind: "bool" }))).toBe("0");
    expect(initialValueFor(meta({ kind: "int", min: 128, max: 4096 }))).toBe(
      "128",
    );
    expect(
      initialValueFor(
        meta({ kind: "enum", enumValues: [{ value: "low", label: "Low" }] }),
      ),
    ).toBe("low");
    expect(initialValueFor(meta({ kind: "string" }))).toBe("");
  });
});

describe("entryKeyLabel", () => {
  test("drops the ConVars section and keeps engine sections", () => {
    expect(entryKeyLabel(["ConVars", "r_ssao"])).toBe("r_ssao");
    expect(entryKeyLabel(["convars", "rate", "max"])).toBe("rate/max");
    expect(entryKeyLabel(["SceneSystem", "CSMCascadeResolution"])).toBe(
      "SceneSystem/CSMCascadeResolution",
    );
  });
});
