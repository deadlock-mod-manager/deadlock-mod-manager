import { describe, expect, it } from "bun:test";
import {
  applyDiff,
  generateDiff,
  getDiffStats,
  parseKv,
  serializeAst,
  serializeData,
} from "../src";

describe("kv-parser-rs", () => {
  describe("basic parsing", () => {
    it("should parse simple key-value pairs", () => {
      const input = `
"RootKey"
{
    "Key1"    "Value1"
    "Key2"    "Value2"
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        RootKey: {
          Key1: "Value1",
          Key2: "Value2",
        },
      });
    });

    it("should parse nested objects", () => {
      const input = `
"Root"
{
    "Level1"
    {
        "Level2"
        {
            "Key"    "Value"
        }
    }
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          Level1: {
            Level2: {
              Key: "Value",
            },
          },
        },
      });
    });

    it("should parse unquoted strings", () => {
      const input = `
Root
{
    Key1    Value1
    Key2    Value2
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          Key1: "Value1",
          Key2: "Value2",
        },
      });
    });

    it("should handle mixed quoted and unquoted strings", () => {
      const input = `
"Root"
{
    Key1    "Quoted Value"
    "Key2"    UnquotedValue
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          Key1: "Quoted Value",
          Key2: "UnquotedValue",
        },
      });
    });
  });

  describe("type conversion", () => {
    it("should convert integer values", () => {
      const input = `
"Root"
{
    "IntKey"    123
    "NegativeInt"    -456
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          IntKey: 123,
          NegativeInt: -456,
        },
      });
    });

    it("should convert float values", () => {
      const input = `
"Root"
{
    "FloatKey"    123.456
    "NegativeFloat"    -78.9
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          FloatKey: 123.456,
          NegativeFloat: -78.9,
        },
      });
    });
  });

  describe("comments", () => {
    it("should skip single-line comments", () => {
      const input = `
"Root"
{
    // This is a comment
    "Key1"    "Value1"
    "Key2"    "Value2" // Comment at end
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          Key1: "Value1",
          Key2: "Value2",
        },
      });
    });

    it("should skip multi-line comments", () => {
      const input = `
"Root"
{
    /* This is a
       multi-line comment */
    "Key1"    "Value1"
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          Key1: "Value1",
        },
      });
    });
  });

  describe("escape sequences", () => {
    it("should handle escape sequences in quoted strings", () => {
      const input = `
"Root"
{
    "Key1"    "Value with\\nnewline"
    "Key2"    "Value with\\ttab"
    "Key3"    "Value with\\"quote\\""
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          Key1: "Value with\nnewline",
          Key2: "Value with\ttab",
          Key3: 'Value with"quote"',
        },
      });
    });
  });

  describe("duplicate keys", () => {
    it("should handle duplicate keys by converting to array", () => {
      const input = `
"Root"
{
    "DupKey"    "Value1"
    "DupKey"    "Value2"
    "DupKey"    "Value3"
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          DupKey: ["Value1", "Value2", "Value3"],
        },
      });
    });

    it("should handle duplicate keys with nested objects", () => {
      const input = `
"Root"
{
    "Item"
    {
        "Name"    "Item1"
    }
    "Item"
    {
        "Name"    "Item2"
    }
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          Item: [{ Name: "Item1" }, { Name: "Item2" }],
        },
      });
    });
  });

  describe("serialization", () => {
    it("should serialize simple objects", () => {
      const data = {
        Root: {
          Key1: "Value1",
          Key2: "Value2",
        },
      };
      const result = serializeData(data);
      expect(result).toContain("Root");
      expect(result).toContain("Key1");
      expect(result).toContain("Value1");
    });

    it("should serialize nested objects", () => {
      const data = {
        Root: {
          Level1: {
            Key: "Value",
          },
        },
      };
      const result = serializeData(data);
      expect(result).toContain("Root");
      expect(result).toContain("Level1");
      expect(result).toContain("Key");
    });

    it("should serialize numbers", () => {
      const data = {
        Root: {
          IntKey: 123,
          FloatKey: 45.67,
        },
      };
      const result = serializeData(data);
      expect(result).toContain("123");
      expect(result).toContain("45.67");
    });

    it("should handle strings that need quoting", () => {
      const data = {
        Root: {
          Key: "Value with spaces",
        },
      };
      const result = serializeData(data);
      expect(result).toContain('"Value with spaces"');
    });

    it("should escape special characters", () => {
      const data = {
        Root: {
          Key: 'Value with "quotes" and \n newline',
        },
      };
      const result = serializeData(data);
      expect(result).toContain('\\"');
      expect(result).toContain("\\n");
    });
  });

  describe("AST serialization", () => {
    it("should preserve exact formatting", () => {
      const input = `"Key"    "Value"`;
      const result = parseKv(input);
      const serialized = serializeAst(result.ast);

      // Should preserve spacing
      expect(serialized).toBe(input);
    });

    it("should preserve comments", () => {
      const input = `// Comment
"Key" "Value"
`;
      const result = parseKv(input);
      const serialized = serializeAst(result.ast);

      expect(serialized).toContain("// Comment");
    });
  });

  describe("round-trip", () => {
    it("should parse and serialize back to equivalent structure", () => {
      const input = `
"Root"
{
    "Key1"    "Value1"
    "Nested"
    {
        "Key2"    "123"
    }
}
`;
      const parsed = parseKv(input);
      const serialized = serializeData(parsed.data);
      const reparsed = parseKv(serialized);
      expect(reparsed.data).toEqual(parsed.data);
    });
  });

  describe("edge cases", () => {
    it("should handle empty objects", () => {
      const input = `
"Root"
{
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {},
      });
    });

    it("should handle keys with spaces in quotes", () => {
      const input = `
"Root"
{
    "Key With Spaces"    "Value"
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          "Key With Spaces": "Value",
        },
      });
    });

    it("should handle empty string values", () => {
      const input = `
"Root"
{
    "EmptyKey"    ""
}
`;
      const result = parseKv(input);
      expect(result.data).toEqual({
        Root: {
          EmptyKey: "",
        },
      });
    });
  });

  describe("diff system", () => {
    it("should generate diff for added keys", () => {
      const source = {};
      const target = { NewKey: "NewValue" };

      const diff = generateDiff(source, target);
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].op).toBe("add");
      expect(diff.changes[0].path).toBe("NewKey");
    });

    it("should generate diff for removed keys", () => {
      const source = { Key: "Value" };
      const target = {};

      const diff = generateDiff(source, target);
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].op).toBe("remove");
      expect(diff.changes[0].path).toBe("Key");
    });

    it("should generate diff for replaced values", () => {
      const source = { Key: "OldValue" };
      const target = { Key: "NewValue" };

      const diff = generateDiff(source, target);
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].op).toBe("replace");
      expect(diff.changes[0].path).toBe("Key");
    });

    it("should apply diff correctly", () => {
      const source = { Key: "OldValue" };
      const target = { Key: "NewValue" };

      const diff = generateDiff(source, target);
      const result = applyDiff(source, diff);

      expect(result).toEqual(target);
    });

    it("should provide diff statistics", () => {
      const source = { Key1: "Value1" };
      const target = { Key2: "Value2", Key3: "Value3" };

      const diff = generateDiff(source, target);
      const stats = getDiffStats(diff);

      expect(stats.total).toBe(3);
      expect(stats.added).toBe(2);
      expect(stats.removed).toBe(1);
      expect(stats.modified).toBe(0);
    });
  });
});
