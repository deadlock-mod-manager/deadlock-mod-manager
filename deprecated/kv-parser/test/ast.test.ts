import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ASTSerializer } from "../src/ast-serializer";
import { KvDocument } from "../src/document";
import { parseKvWithAST, serializeKv } from "../src/parser";

describe("AST Parser and Serializer", () => {
  describe("perfect preservation", () => {
    it("should preserve exact source text including whitespace", () => {
      const input = `"Root"
{
    "Key"    "Value"
}`;
      const { ast } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      expect(output).toBe(input);
    });

    it("should preserve comments", () => {
      const input = `// Root comment
"Root"
{
    // Key comment
    "Key"    "Value"  // inline comment
}`;
      const { ast } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      expect(output).toBe(input);
    });

    it("should preserve block comments", () => {
      const input = `/* Block comment
   spanning multiple lines */
"Root"
{
    "Key"    "Value"
}`;
      const { ast } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      expect(output).toBe(input);
    });

    it("should preserve conditionals", () => {
      const input = `"Config"
{
    "Key1"    "Value1"	[ $WIN32 ]
    "Key2"    "Value2"	[ $LINUX || $OSX ]
    "Key3"    "Value3"	[ !$OSX ]
}`;
      const { ast } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      expect(output).toBe(input);
    });

    it("should preserve conditionals with various whitespace", () => {
      const input = `"Config"
{
    "Key1"    "Value1" [ $WIN32 ]
    "Key2"    "Value2"	[ $LINUX ]
}`;
      const { ast } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      expect(output).toBe(input);
    });

    it("should preserve quote styles", () => {
      const input = `"QuotedKey"
{
    UnquotedKey    UnquotedValue
    "Mixed"        Unquoted
}`;
      const { ast } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      expect(output).toBe(input);
    });

    it("should preserve indentation style", () => {
      const input = `"Root"
{
\t"TabIndented"\t"Value"
\t"MoreTabs"\t"Value2"
}`;
      const { ast } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      expect(output).toBe(input);
    });

    it("should preserve escape sequences", () => {
      const input = `"Root"
{
    "Path"    "C:\\\\Program Files\\\\Steam"
    "Newline"    "Line1\\nLine2"
    "Tab"    "Col1\\tCol2"
    "Quote"    "Say \\"Hello\\""
}`;
      const { ast } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      expect(output).toBe(input);
    });

    it("should preserve empty lines and spacing", () => {
      const input = `"Root"
{

    "Key1"    "Value1"


    "Key2"    "Value2"

}`;
      const { ast } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      expect(output).toBe(input);
    });
  });

  describe("AST structure", () => {
    it("should create correct AST for simple key-value", () => {
      const input = `"Key" "Value"`;
      const { ast, data } = parseKvWithAST(input);

      expect(ast.type).toBe("document");
      expect(ast.children.length).toBeGreaterThan(0);

      // Find the key-value node
      const kvNode = ast.children.find((child) => child.type === "keyvalue");
      expect(kvNode).toBeDefined();
      if (kvNode && kvNode.type === "keyvalue") {
        expect(kvNode.key.value).toBe("Key");
        expect(kvNode.value.type).toBe("string");
        if (kvNode.value.type === "string") {
          expect(kvNode.value.value).toBe("Value");
        }
      }
    });

    it("should create correct AST for nested object", () => {
      const input = `"Root"
{
    "Nested"    "Value"
}`;
      const { ast } = parseKvWithAST(input);

      const kvNode = ast.children.find((child) => child.type === "keyvalue");
      expect(kvNode).toBeDefined();
      if (kvNode && kvNode.type === "keyvalue") {
        expect(kvNode.value.type).toBe("object");
      }
    });

    it("should track positions correctly", () => {
      const input = `"Key" "Value"`;
      const { ast } = parseKvWithAST(input);

      expect(ast.start).toBeDefined();
      expect(ast.end).toBeDefined();
      expect(ast.start.offset).toBe(0);
      expect(ast.start.line).toBe(1);
    });

    it("should preserve comment nodes", () => {
      const input = `// Comment
"Key" "Value"`;
      const { ast } = parseKvWithAST(input);

      const commentNode = ast.children.find(
        (child) => child.type === "comment",
      );
      expect(commentNode).toBeDefined();
      if (commentNode && commentNode.type === "comment") {
        expect(commentNode.value.trim()).toBe("Comment");
        expect(commentNode.raw).toContain("//");
      }
    });

    it("should preserve whitespace nodes", () => {
      const input = `"Key"   "Value"`;
      const { ast } = parseKvWithAST(input);

      const kvNode = ast.children.find((child) => child.type === "keyvalue");
      expect(kvNode).toBeDefined();
      if (kvNode && kvNode.type === "keyvalue") {
        expect(kvNode.separator).toBeDefined();
        if (kvNode.separator) {
          expect(kvNode.separator.type).toBe("whitespace");
          expect(kvNode.separator.value).toBe("   ");
        }
      }
    });
  });

  describe("data extraction", () => {
    it("should extract correct data from AST", () => {
      const input = `"Root"
{
    "Key1"    "Value1"
    "Key2"    "Value2"
}`;
      const { data } = parseKvWithAST(input);

      expect(data).toEqual({
        Root: {
          Key1: "Value1",
          Key2: "Value2",
        },
      });
    });

    it("should handle numbers correctly", () => {
      const input = `"Numbers"
{
    "Integer"    42
    "Float"      3.14
}`;
      const { data } = parseKvWithAST(input);

      expect(data).toEqual({
        Numbers: {
          Integer: 42,
          Float: 3.14,
        },
      });
    });

    it("should handle duplicate keys as arrays", () => {
      const input = `"Root"
{
    "Key"    "Value1"
    "Key"    "Value2"
    "Key"    "Value3"
}`;
      const { data } = parseKvWithAST(input);

      expect(data).toEqual({
        Root: {
          Key: ["Value1", "Value2", "Value3"],
        },
      });
    });
  });

  describe("round-trip with AST", () => {
    it("should maintain exact fidelity through parse → serialize", () => {
      const inputs = [
        `"Simple" "Value"`,
        `"Root"\n{\n    "Key"    "Value"\n}`,
        `// Comment\n"Key" "Value"`,
        `"Root"\n{\n\t"Tab"\t"Value"\n}`,
        `"Path" "C:\\\\Windows\\\\System32"`,
      ];

      for (const input of inputs) {
        const { ast } = parseKvWithAST(input);
        const output = ASTSerializer.serialize(ast);
        expect(output).toBe(input);
      }
    });

    it("should handle complex gameinfo.gi-like structure", () => {
      const input = `"GameInfo"
{
    "game"    "citadel"
    "title"   "Citadel"

    // FileSystem configuration
    "FileSystem"
    {
        "SearchPath"    "citadel"
        "SearchPath"    "core"
    }
}`;
      const { ast, data } = parseKvWithAST(input);
      const output = ASTSerializer.serialize(ast);

      // Should preserve exact formatting
      expect(output).toBe(input);

      // Should also extract correct data
      expect(data.GameInfo).toBeDefined();
      expect((data.GameInfo as Record<string, unknown>).game).toBe("citadel");
      expect(
        (data.GameInfo as Record<string, Record<string, unknown>>).FileSystem
          .SearchPath,
      ).toEqual(["citadel", "core"]);
    });
  });

  describe("KvDocument with AST", () => {
    it("should load and save with AST preservation", () => {
      const input = `// Configuration file
"Root"
{
    "Key"    "Value"
}`;

      const doc = new KvDocument({ useAST: true });
      doc.loadFromString(input);

      const output = doc.toString();
      expect(output).toBe(input);
    });

    it("should have AST available after loading", () => {
      const input = `"Root" { "Key" "Value" }`;

      const doc = new KvDocument({ useAST: true });
      doc.loadFromString(input);

      const ast = doc.getAST();
      expect(ast).toBeDefined();
      expect(ast?.type).toBe("document");
    });
  });

  describe("serializeKv with AST", () => {
    it("should serialize AST using serializeKv", () => {
      const input = `"Root"
{
    "Key"    "Value"
}`;
      const { ast } = parseKvWithAST(input);
      const output = serializeKv(ast);

      expect(output).toBe(input);
    });

    it("should serialize data object using serializeKv", () => {
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
  });

  describe("real-world files", () => {
    it("should preserve conditionals in gameinfo.gi through AST round-trip", () => {
      const filePath = resolve(__dirname, "../data/gameinfo.gi");
      const input = readFileSync(filePath, "utf-8");

      // Parse with AST
      const { ast } = parseKvWithAST(input);

      // Serialize back
      const output = ASTSerializer.serialize(ast);

      // Should be byte-for-byte identical
      expect(output).toBe(input);

      // Specifically verify that conditionals are present
      expect(output).toContain("[ $LINUX || $OSX ]");
      expect(output).toContain("[ !$OSX ]");
    });

    it("should extract conditionals from AST", () => {
      const input = `"Config"
{
    "Key1"    "Value1"	[ $WIN32 ]
}`;
      const { ast } = parseKvWithAST(input);

      // Find the key-value node
      const kvNode = ast.children.find((child) => child.type === "keyvalue");
      expect(kvNode).toBeDefined();

      // Navigate to the actual key-value pair inside the object
      if (
        kvNode &&
        kvNode.type === "keyvalue" &&
        kvNode.value.type === "object"
      ) {
        const objectNode = kvNode.value;
        const innerKvNode = objectNode.children.find(
          (child) => child.type === "keyvalue",
        );

        expect(innerKvNode).toBeDefined();
        if (innerKvNode && innerKvNode.type === "keyvalue") {
          expect(innerKvNode.conditional).toBeDefined();
          expect(innerKvNode.conditional?.type).toBe("conditional");
        }
      }
    });
  });
});
