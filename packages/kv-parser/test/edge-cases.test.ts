import { describe, expect, it } from "vitest";
import { parseKv, serializeKv } from "../src/parser";

describe("edge cases from real-world VDF files", () => {
  describe("special characters in values", () => {
    it("should handle backslashes in file paths", () => {
      const input = `
"Root"
{
    "WindowsPath"    "C:\\Program Files\\Steam"
    "UnixPath"       "/home/user/steam"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          WindowsPath: "C:\\Program Files\\Steam",
          UnixPath: "/home/user/steam",
        },
      });
    });

    it("should handle URLs in values", () => {
      const input = `
"Config"
{
    "URL"    "https://example.com/path/to/resource"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Config: {
          URL: "https://example.com/path/to/resource",
        },
      });
    });

    it("should handle relative paths with dots", () => {
      const input = `
"Config"
{
    "RelativePath"    "../parent/child/file.txt"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Config: {
          RelativePath: "../parent/child/file.txt",
        },
      });
    });
  });

  describe("numeric edge cases", () => {
    it("should handle very large numbers", () => {
      const input = `
"Config"
{
    "BigInt"    "999999999"
    "BigFloat"  "123456.789"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Config: {
          BigInt: 999999999,
          BigFloat: 123456.789,
        },
      });
    });

    it("should handle negative numbers", () => {
      const input = `
"Config"
{
    "NegInt"    "-123"
    "NegFloat"  "-45.67"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Config: {
          NegInt: -123,
          NegFloat: -45.67,
        },
      });
    });

    it("should handle zero values", () => {
      const input = `
"Config"
{
    "Zero"      "0"
    "ZeroFloat" "0.0"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Config: {
          Zero: 0,
          ZeroFloat: 0,
        },
      });
    });

    it("should handle numbers as strings when quoted unnecessarily", () => {
      const input = `
"Config"
{
    "QuotedNumber"    "42"
}
`;
      const result = parseKv(input);
      expect(result.Config).toHaveProperty("QuotedNumber");
      // Should be converted to number
      expect(
        typeof (
          result.Config as {
            QuotedNumber: number;
          }
        ).QuotedNumber,
      ).toBe("number");
    });
  });

  describe("whitespace variations", () => {
    it("should handle mixed tabs and spaces", () => {
      const input = `
"Root"
{
\t"TabKey"\t\t"TabValue"
    "SpaceKey"    "SpaceValue"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          TabKey: "TabValue",
          SpaceKey: "SpaceValue",
        },
      });
    });

    it("should handle multiple spaces between key and value", () => {
      const input = `
"Root"
{
    "Key"         "Value"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          Key: "Value",
        },
      });
    });

    it("should handle no spaces around braces", () => {
      const input = `"Root"{"Key""Value"}`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          Key: "Value",
        },
      });
    });
  });

  describe("comment edge cases", () => {
    it("should handle comment at end of line", () => {
      const input = `
"Root"
{
    "Key"    "Value" // inline comment
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          Key: "Value",
        },
      });
    });

    it("should handle URL-like strings that are not comments", () => {
      const input = `
"Root"
{
    "Protocol"    "http://example.com"
    "Path"        "path/to/file"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          Protocol: "http://example.com",
          Path: "path/to/file",
        },
      });
    });

    it("should handle multiple consecutive comments", () => {
      const input = `
"Root"
{
    // Comment 1
    // Comment 2
    // Comment 3
    "Key"    "Value"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          Key: "Value",
        },
      });
    });
  });

  describe("special key names", () => {
    it("should handle numeric keys", () => {
      const input = `
"Root"
{
    "1"    "First"
    "2"    "Second"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          "1": "First",
          "2": "Second",
        },
      });
    });

    it("should handle keys with underscores", () => {
      const input = `
"Root"
{
    "key_with_underscores"    "value"
    "UPPER_CASE_KEY"          "value2"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          key_with_underscores: "value",
          UPPER_CASE_KEY: "value2",
        },
      });
    });

    it("should handle keys with dots (namespaced keys)", () => {
      const input = `
"Root"
{
    "namespace.key"    "value"
    "a.b.c"            "deep"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          "namespace.key": "value",
          "a.b.c": "deep",
        },
      });
    });
  });

  describe("deeply nested structures", () => {
    it("should handle 5+ levels of nesting", () => {
      const input = `
"Level1"
{
    "Level2"
    {
        "Level3"
        {
            "Level4"
            {
                "Level5"
                {
                    "Key"    "DeepValue"
                }
            }
        }
    }
}
`;
      const result = parseKv(input);
      expect(result).toHaveProperty("Level1");
      const level1 = result.Level1 as Record<string, unknown>;
      expect(level1).toHaveProperty("Level2");
      const level2 = level1.Level2 as Record<string, unknown>;
      expect(level2).toHaveProperty("Level3");
      const level3 = level2.Level3 as Record<string, unknown>;
      expect(level3).toHaveProperty("Level4");
      const level4 = level3.Level4 as Record<string, unknown>;
      expect(level4).toHaveProperty("Level5");
      const level5 = level4.Level5 as Record<string, unknown>;
      expect(level5.Key).toBe("DeepValue");
    });
  });

  describe("array-like structures (duplicate keys)", () => {
    it("should handle many duplicate keys", () => {
      const input = `
"Root"
{
    "Item"    "1"
    "Item"    "2"
    "Item"    "3"
    "Item"    "4"
    "Item"    "5"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Root: {
          Item: [1, 2, 3, 4, 5],
        },
      });
    });

    it("should handle mixed duplicate and unique keys", () => {
      const input = `
"Root"
{
    "Unique1"     "Value1"
    "Duplicate"   "First"
    "Unique2"     "Value2"
    "Duplicate"   "Second"
    "Duplicate"   "Third"
}
`;
      const result = parseKv(input);
      const root = result.Root as Record<string, unknown>;
      expect(root.Unique1).toBe("Value1");
      expect(root.Unique2).toBe("Value2");
      expect(root.Duplicate).toEqual(["First", "Second", "Third"]);
    });
  });

  describe("boolean-like values", () => {
    it("should treat 0 and 1 as numbers, not booleans", () => {
      const input = `
"Config"
{
    "Enabled"     "1"
    "Disabled"    "0"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Config: {
          Enabled: 1,
          Disabled: 0,
        },
      });
      // Should be numbers, not booleans
      const config = result.Config as Record<string, unknown>;
      expect(typeof config.Enabled).toBe("number");
      expect(typeof config.Disabled).toBe("number");
    });

    it("should handle true/false as strings", () => {
      const input = `
"Config"
{
    "BoolTrue"     "true"
    "BoolFalse"    "false"
}
`;
      const result = parseKv(input);
      expect(result).toEqual({
        Config: {
          BoolTrue: "true",
          BoolFalse: "false",
        },
      });
    });
  });

  describe("serialization edge cases", () => {
    it("should quote values that look like numbers but are strings", () => {
      const data = {
        Root: {
          LooksLikeNumber: "123",
        },
      };
      const serialized = serializeKv(data);
      // Should be quoted to distinguish from actual numbers
      expect(serialized).toContain('"123"');
    });

    it("should handle empty nested objects", () => {
      const data = {
        Root: {
          EmptyChild: {},
          NonEmptyChild: {
            Key: "Value",
          },
        },
      };
      const serialized = serializeKv(data);
      const reparsed = parseKv(serialized);
      expect(reparsed).toEqual(data);
    });
  });
});
