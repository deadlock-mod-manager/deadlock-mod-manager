import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKv, parseKvFile, serializeKv } from "../src/parser";

describe("round-trip conversion", () => {
  describe("structure preservation", () => {
    it("should preserve structure through parse → serialize → parse", () => {
      const input = `
"Root"
{
    "Key1"    "Value1"
    "Nested"
    {
        "Key2"    "123"
        "Key3"    "Value3"
    }
}
`;
      const parsed1 = parseKv(input);
      const serialized = serializeKv(parsed1);
      const parsed2 = parseKv(serialized);

      expect(parsed2).toEqual(parsed1);
    });

    it("should preserve duplicate keys through round-trip", () => {
      const input = `
"Root"
{
    "Item"    "First"
    "Item"    "Second"
    "Item"    "Third"
}
`;
      const parsed1 = parseKv(input);
      const serialized = serializeKv(parsed1);
      const parsed2 = parseKv(serialized);

      expect(parsed2).toEqual(parsed1);
      const root = parsed2.Root;
      if (typeof root === "object" && root !== null && !Array.isArray(root)) {
        expect(root.Item).toEqual(["First", "Second", "Third"]);
      }
    });

    it("should preserve deeply nested structures", () => {
      const input = `
"L1"
{
    "L2"
    {
        "L3"
        {
            "L4"
            {
                "Key"    "Value"
            }
        }
    }
}
`;
      const parsed1 = parseKv(input);
      const serialized = serializeKv(parsed1);
      const parsed2 = parseKv(serialized);

      expect(parsed2).toEqual(parsed1);
    });

    it("should preserve numbers correctly", () => {
      const input = `
"Config"
{
    "Integer"    42
    "Float"      3.14
    "Negative"   -10
}
`;
      const parsed1 = parseKv(input);
      const serialized = serializeKv(parsed1);
      const parsed2 = parseKv(serialized);

      expect(parsed2).toEqual(parsed1);
      const config = parsed2.Config as Record<string, unknown>;
      expect(typeof config.Integer).toBe("number");
      expect(typeof config.Float).toBe("number");
    });
  });

  describe("formatting options", () => {
    it("should support tab indentation", () => {
      const data = {
        Root: {
          Key1: "Value1",
          Nested: {
            Key2: "Value2",
          },
        },
      };

      const serialized = serializeKv(data, { useTabs: true });

      // Check that tabs are used
      expect(serialized).toContain("\t");
      expect(serialized).toMatch(/\t\w/); // Tab followed by word character

      // Should still parse correctly
      const parsed = parseKv(serialized);
      expect(parsed).toEqual(data);
    });

    it("should support custom indent size", () => {
      const data = {
        Root: {
          Key: "Value",
        },
      };

      const serialized2 = serializeKv(data, { indentSize: 2 });
      const serialized4 = serializeKv(data, { indentSize: 4 });

      // 2-space should be shorter than 4-space
      expect(serialized2.length).toBeLessThan(serialized4.length);

      // Both should parse correctly
      expect(parseKv(serialized2)).toEqual(data);
      expect(parseKv(serialized4)).toEqual(data);
    });

    it("should minimize quotes by default", () => {
      const data = {
        Root: {
          SimplePath: "citadel/addons",
          SimpleValue: "test_value",
          NeedsQuotes: "has spaces",
        },
      };

      const serialized = serializeKv(data);

      // Paths and simple values should not be quoted
      expect(serialized).toContain("citadel/addons");
      expect(serialized).not.toContain('"citadel/addons"');
      expect(serialized).toContain("test_value");

      // Values with spaces should be quoted
      expect(serialized).toContain('"has spaces"');
    });

    it("should quote all strings when requested", () => {
      const data = {
        Root: {
          SimpleValue: "test",
          Path: "path/to/file",
        },
      };

      const serialized = serializeKv(data, { quoteAllStrings: true });

      // All values should be quoted
      expect(serialized).toContain('"test"');
      expect(serialized).toContain('"path/to/file"');
    });
  });

  describe("real-world files", () => {
    it("should round-trip gameinfo.gi structure correctly", () => {
      const filePath = resolve(__dirname, "../data/gameinfo.gi");
      const parsed1 = parseKvFile(filePath);

      const serialized = serializeKv(parsed1);
      const parsed2 = parseKv(serialized);

      // Structure should be identical
      expect(parsed2).toEqual(parsed1);

      // Verify some key values are preserved
      const gameInfo1 = parsed1.GameInfo as Record<string, unknown>;
      const gameInfo2 = parsed2.GameInfo as Record<string, unknown>;

      expect(gameInfo2.game).toBe(gameInfo1.game);
      expect(gameInfo2.title).toBe(gameInfo1.title);
      expect(gameInfo2).toHaveProperty("FileSystem");
      expect(gameInfo2).toHaveProperty("ConVars");
    });

    it("should handle complex nested structures from gameinfo.gi", () => {
      const filePath = resolve(__dirname, "../data/gameinfo.gi");
      const parsed = parseKvFile(filePath);

      const gameInfo = parsed.GameInfo as Record<string, unknown>;
      const fileSystem = gameInfo.FileSystem as Record<string, unknown>;
      const searchPaths = fileSystem.SearchPaths as Record<string, unknown>;

      // Should have duplicate keys (arrays)
      expect(searchPaths.Game).toBeDefined();
      expect(Array.isArray(searchPaths.Game)).toBe(true);

      // Serialize and re-parse
      const serialized = serializeKv(parsed);
      const reparsed = parseKv(serialized);
      const reparsedGameInfo = reparsed.GameInfo as Record<string, unknown>;
      const reparsedFileSystem = reparsedGameInfo.FileSystem as Record<
        string,
        unknown
      >;
      const reparsedSearchPaths = reparsedFileSystem.SearchPaths as Record<
        string,
        unknown
      >;

      // Arrays should be preserved
      expect(Array.isArray(reparsedSearchPaths.Game)).toBe(true);
      expect(reparsedSearchPaths.Game).toEqual(searchPaths.Game);
    });
  });

  describe("edge cases", () => {
    it("should handle empty objects", () => {
      const data = {
        Root: {
          Empty: {},
          NotEmpty: {
            Key: "Value",
          },
        },
      };

      const serialized = serializeKv(data);
      const parsed = parseKv(serialized);

      expect(parsed).toEqual(data);
    });

    it("should handle special characters in values", () => {
      const data = {
        Root: {
          WindowsPath: "C:\\Program Files\\Steam",
          Path: "relative/path/to/file",
          Escaped: 'Value with "quotes"',
        },
      };

      const serialized = serializeKv(data);
      const parsed = parseKv(serialized);

      expect(parsed).toEqual(data);
    });

    it("should handle URLs when properly quoted", () => {
      // URLs with :// need to be quoted or they'll be parsed as comments
      const input = `
"Root"
{
    "URL"    "https://example.com/path"
    "Protocol"    "http://test.com"
}
`;
      const parsed = parseKv(input);
      const serialized = serializeKv(parsed);
      const reparsed = parseKv(serialized);

      expect(reparsed).toEqual(parsed);
      const root = reparsed.Root;
      if (typeof root === "object" && root !== null && !Array.isArray(root)) {
        expect(root.URL).toBe("https://example.com/path");
      }
    });

    it("should handle keys with dots", () => {
      const data = {
        Root: {
          "namespace.key": "value",
          "a.b.c": "deep",
        },
      };

      const serialized = serializeKv(data);
      const parsed = parseKv(serialized);

      expect(parsed).toEqual(data);
    });

    it("should handle numeric keys", () => {
      const data = {
        Root: {
          "1": "First",
          "2": "Second",
          "100": "Hundred",
        },
      };

      const serialized = serializeKv(data);
      const parsed = parseKv(serialized);

      expect(parsed).toEqual(data);
    });
  });

  describe("JSON to KeyValues conversion", () => {
    it("should convert JSON object to valid KeyValues", () => {
      const jsonData = {
        Config: {
          setting1: "value1",
          setting2: 42,
          nested: {
            innerKey: "innerValue",
          },
        },
      };

      const kvString = serializeKv(jsonData);
      const parsed = parseKv(kvString);

      expect(parsed).toEqual(jsonData);
    });

    it("should handle arrays as duplicate keys in JSON", () => {
      const jsonData = {
        Root: {
          Items: ["Item1", "Item2", "Item3"],
        },
      };

      const kvString = serializeKv(jsonData);

      // Should serialize as duplicate keys
      expect(kvString).toContain("Items");
      expect(kvString.match(/Items/g)?.length).toBe(3);

      // Should parse back correctly
      const parsed = parseKv(kvString);
      expect(parsed).toEqual(jsonData);
    });
  });
});
