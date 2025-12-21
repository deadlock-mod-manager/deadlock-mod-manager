import { describe, expect, it } from "vitest";

/**
 * Tests for browser-compatible exports
 * These tests ensure the browser entry point works without node:fs
 */
describe("Browser exports", () => {
  it("should import browser entry point without errors", async () => {
    // This will fail at import time if node:fs is accidentally included
    const browserModule = await import("../src/index.browser.ts");

    expect(browserModule).toBeDefined();
    expect(browserModule.parseKv).toBeDefined();
    expect(browserModule.parseKvWithAST).toBeDefined();
    expect(browserModule.serializeKv).toBeDefined();
    expect(browserModule.KvDocument).toBeDefined();
    expect(browserModule.ASTParser).toBeDefined();
    expect(browserModule.ASTSerializer).toBeDefined();
  });

  it("should parse KeyValues from string", async () => {
    const { parseKv } = await import("../src/index.browser.ts");

    const input = `"Root"
{
    "Key"    "Value"
}`;
    const result = parseKv(input);

    expect(result).toEqual({
      Root: {
        Key: "Value",
      },
    });
  });

  it("should parse with AST", async () => {
    const { parseKvWithAST, ASTSerializer } = await import(
      "../src/index.browser.ts"
    );

    const input = `"Root"
{
    "Key"    "Value"
}`;
    const { ast, data } = parseKvWithAST(input);

    expect(data).toEqual({
      Root: {
        Key: "Value",
      },
    });

    const output = ASTSerializer.serialize(ast);
    expect(output).toBe(input);
  });

  it("should serialize KeyValues to string", async () => {
    const { serializeKv } = await import("../src/index.browser.ts");

    const data = {
      Root: {
        Key: "Value",
      },
    };

    const output = serializeKv(data);
    expect(output).toContain("Root");
    expect(output).toContain("Key");
    expect(output).toContain("Value");
  });

  it("should work with KvDocument", async () => {
    const { KvDocument } = await import("../src/index.browser.ts");

    const doc = new KvDocument();
    const input = `"Root"
{
    "Key"    "Value"
}`;

    doc.loadFromString(input);

    expect(doc.get("Root.Key")).toBe("Value");

    doc.set("Root.NewKey", "NewValue");
    expect(doc.get("Root.NewKey")).toBe("NewValue");

    const output = doc.toString();
    expect(output).toContain("NewKey");
    expect(output).toContain("NewValue");
  });

  it("should preserve conditionals in browser mode", async () => {
    const { parseKvWithAST, ASTSerializer } = await import(
      "../src/index.browser.ts"
    );

    const input = `"Config"
{
    "Key1"    "Value1"	[ $WIN32 ]
    "Key2"    "Value2"	[ !$OSX ]
}`;

    const { ast } = parseKvWithAST(input);
    const output = ASTSerializer.serialize(ast);

    expect(output).toBe(input);
    expect(output).toContain("[ $WIN32 ]");
    expect(output).toContain("[ !$OSX ]");
  });

  it("should export all necessary types", async () => {
    const browserModule = await import("../src/index.browser.ts");

    // Check that types are exported (TypeScript will catch this at compile time)
    expect(browserModule).toBeDefined();
  });
});
