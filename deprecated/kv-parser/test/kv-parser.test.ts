import { describe, expect, it } from "vitest";
import { parseKv, serializeKv } from "../src/parser";

describe("kv-parser", () => {
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      const result = serializeKv(data);
      // Keys and values are unquoted if they don't need quotes
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
      const result = serializeKv(data);
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
      const result = serializeKv(data);
      expect(result).toContain("123");
      expect(result).toContain("45.67");
    });

    it("should handle strings that need quoting", () => {
      const data = {
        Root: {
          Key: "Value with spaces",
        },
      };
      const result = serializeKv(data);
      expect(result).toContain('"Value with spaces"');
    });

    it("should escape special characters", () => {
      const data = {
        Root: {
          Key: 'Value with "quotes" and \n newline',
        },
      };
      const result = serializeKv(data);
      expect(result).toContain('\\"');
      expect(result).toContain("\\n");
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
      const serialized = serializeKv(parsed);
      const reparsed = parseKv(serialized);
      expect(reparsed).toEqual(parsed);
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
      expect(result).toEqual({
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
      expect(result).toEqual({
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
      expect(result).toEqual({
        Root: {
          EmptyKey: "",
        },
      });
    });
  });
});
